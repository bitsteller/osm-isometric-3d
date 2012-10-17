import sys
import signal, os, stat, time
from datetime import datetime,timedelta
import json
import getpass
import ftplib
import keyring
import shutil
import math
import Image
import PyRSS2Gen

#==USER OPTIONS==================

OPTION_ENABLE_TWITTER = True

COMMAND_CURL = "curl -OL" #if you don't have curl installed, you can change this to COMMAND_CURL = "wget"
COMMAND_OSMOSIS = "osmosis/osmosis-0.39/bin/osmosis"
COMMAND_OSM2POV = "osm2pov/osm2pov"
COMMAND_POVRAY = "povray"
COMMAND_TWIDGE = "twidge"

DIR_OSM2POV = "osm2pov"

#===CONSTANTS====================


application_name = "osm2pov-make"
version_number = "0.3.1"

current_phase = 0
total_phases = 5

#==GLOBALS=======================

config = json.loads(open("config.json").read())
cities = json.loads(open("cities.json").read())
status = {}

ftp_init = False
ftp_user = ""
ftp_url = ""
ftp_password = ""
ftp_path = ""

rendering = {}
last_status_time = 0

city_id = ""

#==COMMON FUNCTIONS==============

def deg2tile(lat_deg, lon_deg, zoom):
	lat_rad = math.radians(lat_deg)
	n = 2.0 ** zoom
	xtile = int((lon_deg + 180.0) / 360.0 * n)
	ytile = int((1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n)
	return (xtile, ytile)

def signal_handler(signal, frame):
	print("Got SIGINT. Aborting...")
	try:
		update_city_state(city_id, "FAILED", "Rendering aborted.")
	except:
		pass
	sys.exit(0)

def confirm(prompt_str, allow_empty=False, default=False):
	fmt = (prompt_str, 'y', 'n') if default else (prompt_str, 'n', 'y')
	if allow_empty:
		prompt = '%s [%s]|%s: ' % fmt
	else:
		prompt = '%s %s|%s: ' % fmt
	while True:
		ans = raw_input(prompt).lower()
		if ans == '' and allow_empty:
			return default
		elif ans == 'y':
			return True
		elif ans == 'n':
			return False
		else:
			print("Please enter y or n.")

def dot_storbinary(ftp, cmd, fp, blocksize=4*16384): #(8192) Extend storbinary to show a dot when a block was sent
	ftp.voidcmd('TYPE I')
	conn = ftp.transfercmd(cmd)
	while 1:
		buf = fp.read(blocksize)
		if not buf: break
		conn.send(buf)
		sys.stdout.write('.')
		sys.stdout.flush()
	conn.close()
	print ("")
	return ftp.voidresp()

def upload_file(filename):
	global ftp_url, ftp_user, ftp_password, ftp_init, ftp_path
	
	prepare_ftp()
	
	print ("Uploading file '" + filename + "'...")
	try:
		s = ftplib.FTP(ftp_url,ftp_user,ftp_password)
		f = open("output/" + filename,'rb')
		s.cwd(ftp_path)
		dot_storbinary(s,'STOR ' + filename, f)
		f.close()
		s.quit()
	except Exception as detail: raise Exception("Uploading file '" + filename + "' failed: " + str(detail))
	
	print ("Uploading file '" + filename + "' finished.")

def file_exists(filename):
	if os.path.isfile(filename):
		filestats = os.stat(filename)
		d = (datetime.now() - timedelta(4)).timetuple() #Keep file if not older than 5 days
		if time.localtime(filestats[stat.ST_MTIME]) > d:
			return True
		else:
			os.remove(filename)
			return False
	else:
		return False

def execute_cmd(action, cmd, ignore_error=False):
	sys.stdout.write(action + "...")
	sys.stdout.flush()
	
	value = os.system(cmd)
	if (ignore_error==False and value != 0): raise Exception(action + " failed.")
	
	if (value == 0):
		print(" FINISHED")
	else:
		print(" FAILED")

def prepare_ftp(force_password=False):
	global ftp_url, ftp_user, ftp_password, ftp_init, ftp_path, keyring_name
	if ftp_init == False:
		ftp_url = config["ftp"]["url"]
		ftp_user = config["ftp"]["user"]
		ftp_path = config["ftp"]["path"]
		
		ftp_password = keyring.get_password(ftp_url, ftp_user)
		if ftp_password == None or force_password == True:
			while 1:
				print(application_name + " needs a password to continue. Please enter the password for")
				print(" * service: ftp")
				print(" * domain: " + ftp_url)
				print(" * user: " + ftp_user)
				print("to continue. Note: To change the username and the domain, you have to edit cities.xml.")
				ftp_password = getpass.getpass("Please enter the password:\n")
				if ftp_password != "":
					ftp_init=True
					break
				else:
					print ("Authorization failed (no password entered).")
			# store the password
			if confirm("Do you want to securely store the password in the keyring of your operating system?",default=True):
				keyring.set_password(ftp_url, ftp_user, ftp_password)
				print("Password has been stored. You will not have to enter it again the next time.")

def getCityById(array, city_id):
	filter = [city for city in array if city["city_id"] == city_id]
	if len(filter) > 0:
		return filter[0]
	else:
		return None

def getMinMaxTiles(city_id):
	city = [city for city in cities["cities"] if city["city_id"] == city_id][0]
	mintile_x, mintile_y = deg2tile(city["area"]["top"],city["area"]["left"],12)
	maxtile_x, maxtile_y = deg2tile(city["area"]["bottom"],city["area"]["right"],12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	return (mintile_x, maxtile_x, mintile_y, maxtile_y)

#==STATUS FUNCTIONS=================

def upload_status():
	global last_status_time
	
	s = json.dumps(status, indent=3)
	f = open("status.json", 'w')
	f.write(s + "\n")
	f.close()
	execute_cmd("Moving status.json", "cp status.json output/status.json")
	upload_file("status.json")
	last_status_time = int(time.time()*1000)

def init_status(id):
	global status
	#upload cities.json
	execute_cmd("Moving cities.json", "cp cities.json output/cities.json")
	upload_file("cities.json")
	
	#init status.json for the city
	if os.path.isfile("status.json"):
		status = json.loads(open("status.json").read())
		if status["version"] != 1:
			raise IOException("Version of status.json is not compatible. Must be 1.")
	else:
		status = {"version": 1, "cities": []}
	
	city = getCityById(status["cities"], id)
	
	if city == None:
		city = {"city_id": id, "stats": dict(), "status": {"type": "READY"}, "renderings": []}
		status["cities"].append(city)
	
	mintile_x, maxtile_x, mintile_y, maxtile_y = getMinMaxTiles(id)
	numberoftiles = ((maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1))
	city["stats"]["tiles"] = numberoftiles
	city["stats"]["total_tiles"] = numberoftiles * (1*1 + 2*2 + 4*4 + 8*8) #zoom from 12 to 15

def status_start(id):
	global rendering
	city = getCityById(status["cities"], id)
	rendering_id = 0
	if len(city["renderings"]) > 0:
		rendering_id = max([rendering["rendering_id"] for rendering in city["renderings"]]) + 1
	rendering = { 	"rendering_id": rendering_id,
					"start": int(time.time()*1000),
					"succesful": False,
					"durations": [] }
	city["renderings"].append(rendering)
	upload_status()

def status_end_phase(id, phase):
	global rendering
	city = getCityById(status["cities"], id)
	rendering["durations"].append(int(time.time()*1000) - rendering["start"] - sum(rendering["durations"]))
	if phase == total_phases:
		rendering["end"] = int(time.time()*1000)
		rendering["succesful"] = True
		city = getCityById(status["cities"], id)
		city["status"] = { "time": int(time.time()*1000),
						"type": "READY" }
	upload_status()

def status_progress(id, description, phase, step, total_steps):
	global current_phase
	
	print("Status: " + description + " (" + str(step) + "/" + str(total_steps) + ")")
	city = getCityById(status["cities"], id)
	lasttime = 0
	if "time" in city["status"]:
		lasttime = city["status"]["time"]
	city["status"] = { "time": int(time.time()*1000),
					"type": "WORKING",
					"description": description,
					"phase": phase,
					"total_phases": total_phases,
					"step": step,
					"total_steps": total_steps }
	if phase > current_phase:
		upload_status()
	elif int(time.time()*1000) > last_status_time + 30*1000:
		upload_status()
	current_phase = phase

def status_failed(id, description):
	city = getCityById(status["cities"], id)
	city.status = { "time": int(time.time()*1000),
					"type": "FAILED",
					"description": description }
	upload_status()

def status_cleanup():
	print("cleanup") #TODO: cleanup old renderings etc. from status.json
	upload_status()


#==PROGRAM FUNCTIONS=================

# Download a osm file
def download_osm(source):
	filename = source.split("/")[-1]
	
	if file_exists(filename) == False:
		execute_cmd("Downloading '" + source + "'", COMMAND_CURL + " " + source)

def download_city(id):
	city = [city for city in cities["cities"] if city["city_id"] == id][0]
	
	status_progress(id, "Downloading", 1, 1, 2)
	source = city["source"]
	download_osm(source) #Download .pbf

	status_progress(id, "Downloading", 1, 2, 2)
	filename = source.split("/")[-1]
	trim_osm(filename, id, city["area"]["top"], city["area"]["left"], city["area"]["bottom"], city["area"]["right"]) #Trim and convert to .osm
	status_end_phase(id, 1)


# Trim a osm file
def trim_osm(sourcefile, id, top, left, bottom, right):
	filename = id + ".osm"
	
	if file_exists(filename) == False:
		command  = COMMAND_OSMOSIS + ' '
		command += '--read-bin file="' + sourcefile + '" '
		command += '--bounding-box top=' + str(top) + ' left=' + str(left) + ' bottom=' + str(bottom) + ' right=' + str(right) + ' '
		command += '--write-xml file="' + id + '.osm"'
		execute_cmd("Trimming osm file to '" + id + "'", command)
	
#Render map tiles 2048*2048 (tile numbers of zoom 12)
def render_tiles(id):
	#make sure that temp dir is empty
	if os.path.exists("temp"):
		shutil.rmtree("temp")
	os.mkdir("temp")
	tempdir = "temp/" + id
	os.mkdir(tempdir)

	#copy textures and styles.inc
	if os.path.exists("textures"):
		shutil.rmtree("textures")
	shutil.copytree(DIR_OSM2POV + "/textures", "textures")

	if os.path.exists("styles.inc"):
		shutil.rm("styles.inc")
	
	shutil.copy(DIR_OSM2POV + "/osm2pov-styles.inc", "osm2pov-styles.inc")

	
	#compute tile numbers to render
	mintile_x, maxtile_x, mintile_y, maxtile_y = getMinMaxTiles(id)
	numberoftiles = (maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1)
	tilecount = 0
	
	#convert the tiles to .pov
	osmfile = id + ".osm"
	for x in range(mintile_x, maxtile_x + 1):
		for y in range(mintile_y, maxtile_y + 1):
			tilecount += 1
			povfile = id + "-" + str(x) + "_" + str(y) + ".pov"
			status_progress(id, "Converting", 2, tilecount, numberoftiles)
			execute_cmd("Converting " + povfile, COMMAND_OSM2POV + " " + osmfile + " " + povfile + " " + str(x) + " " + str(y))
	status_end_phase(id, 2)

	tilecount = 0
	#render the tiles
	for x in range(mintile_x, maxtile_x + 1):
		for y in range(mintile_y, maxtile_y + 1):
			tilecount += 1
			povfile = id + "-" + str(x) + "_" + str(y) + ".pov"
			pngfile = id + "-" + str(x) + "_" + str(y) + ".png"
			status_progress(id, "Rendering", 3, tilecount, numberoftiles)
			execute_cmd("Rendering " + pngfile, COMMAND_POVRAY + " +W2048 +H2048 +B100 -D +A " + povfile)
			os.remove(povfile)
			if not(os.path.exists(tempdir + "/" + str(x))):
				os.mkdir(tempdir + "/" + str(x))
			execute_cmd("Moving output file of city '" + id + "': " + pngfile, "mv " + pngfile + " " + tempdir+"/"+str(x)+"/"+str(y)+".png")
	status_end_phase(id, 3)


def generate_tiles(id):
	#make sure that tile dir exists
	if not(os.path.exists("output/tiles")):
		os.mkdir("output/tiles")
	tiledir = "output/tiles"
	
	#compute tile numbers rendered
	mintile_x, maxtile_x, mintile_y, maxtile_y = getMinMaxTiles(id)
	numberoftiles = ((maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1)) * (1*1 + 2*2 + 4*4 + 8*8) #zoom from 12 to 15
	tilecount = 0
	
	#cut and scale tiles
	tempdir = "temp/" + id
	
	for zoom in range(12,16):
		if not(os.path.exists(tiledir + "/" + str(zoom))):
			os.mkdir(tiledir + "/" + str(zoom))
		for x in range(mintile_x, maxtile_x + 1):
			for y in range(mintile_y, maxtile_y + 1):
				im = Image.open(tempdir+"/"+str(x)+"/"+str(y)+".png")
				for i in range(0, int(math.pow(2,zoom-12))):
					for j in range(0, int(math.pow(2,zoom-12))):
						tilecount += 1
						status_progress(id, "Cutting tiles", 4, tilecount, numberoftiles)
						tile_x = int(x*math.pow(2,zoom-12)) + i
						tile_y = int(y*math.pow(2,zoom-12)) + j
						
						if not(os.path.exists(tiledir + "/" + str(zoom) + "/" + str(tile_x))):
							os.mkdir(tiledir + "/" + str(zoom) + "/" + str(tile_x))
						
						boxsize = 2048/int(math.pow(2,zoom-12))
						box = (i*boxsize, j*boxsize, i*boxsize + boxsize, j*boxsize + boxsize)
						print(box)
						size = (256, 256)
						region = im.crop(box)
						region.thumbnail(size)
						region.save(tiledir + "/" + str(zoom) + "/" + str(tile_x) + "/" + str(tile_y) + ".png", "PNG")
	status_end_phase(id, 4)

def upload_tiles(id):
	global ftp_url, ftp_user, ftp_password, ftp_init, ftp_path
	
	#compute tile numbers rendered
	mintile_x, maxtile_x, mintile_y, maxtile_y = getMinMaxTiles(id)
	numberoftiles = ((maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1)) * (1*1 + 2*2 + 4*4 + 8*8) #zoom from 12 to 15
	tilecount = 0
	
	print("Prepare upload...")
	prepare_ftp()
	s = ftplib.FTP(ftp_url,ftp_user,ftp_password)
	s.cwd(ftp_path)
	try: s.mkd("tiles")
	except: pass
	s.cwd("tiles")
	
	for zoom in range(12,16):
		try: s.mkd(str(zoom))
		except: pass
		s.cwd(str(zoom))
		
		for x in range(mintile_x, maxtile_x + 1):
			for y in range(mintile_y, maxtile_y + 1):
				for i in range(0, int(math.pow(2,zoom-12))):
					tile_x = int(x*math.pow(2,zoom-12)) + i
					try: s.mkd(str(tile_x))
					except: pass
					s.cwd(str(tile_x))
					for j in range(0, int(math.pow(2,zoom-12))):
						tilecount += 1
						tile_y = int(y*math.pow(2,zoom-12)) + j
						status_progress(id, "Uploading", 5, tilecount, numberoftiles)
						print("Uploading tile (zoom=" + str(zoom) + ", x=" + str(tile_x) + ", y=" + str(tile_y) + ")...")
						try:	
							f = open("output/tiles/" + str(zoom) + "/" + str(tile_x) + "/" + str(tile_y) + ".png",'rb')
							dot_storbinary(s,'STOR ' + str(tile_y) + ".png", f)
							f.close()
						except: raise Exception("Uploading tile (zoom=" + str(zoom) + ", x=" + str(x) + ", y=" + str(y) + ") failed.")
						
						print("Uploading tile (zoom=" + str(zoom) + ", x=" + str(tile_x) + ", y=" + str(tile_y) + ") finished.")
					s.cwd("..")
		s.cwd("..")                           
	s.quit()
	status_end_phase(id, 5)

def tweet_finished(id):
	city = [city for city in cities["cities"] if city["city_id"] == id][0]
	if OPTION_ENABLE_TWITTER:
		execute_cmd("Updating twitter status", COMMAND_TWIDGE + ' update "' + "Updated isometric 3D map of " + city["name"] + ' http://bitsteller.bplaced.net/osm' + ' #OpenStreetMap"', True)

def generate_feed():
	print("Generating RSS feed...")
	items = []
	for city in status["cities"]:
		for rendering in city["renderings"]:
			if rendering["succesful"]:
				item = PyRSS2Gen.RSSItem(
										 title = "Finished isometric 3D rendering of " + getCityById(cities["cities"],city["city_id"])["name"],
										 link = "http://bitsteller.bplaced.net/osm/map.html#" + city["city_id"],
										 description = "",
										 guid = PyRSS2Gen.Guid("http://bitsteller.bplaced.net/osm/map.html#" + city["city_id"] + "-" + str(rendering["rendering_id"])),
										 pubDate = datetime.now()) #datetime.fromtimestamp(rendering["end"]/1000.0)
				items.append(item)
	rss = PyRSS2Gen.RSS2(
					 title = "Finished isometric 3D renderings on http://bitsteller.bplaced.net/osm",
					 link = "http://bitsteller.bplaced.net/osm/index.html",
					 description = "This feed notifies you about every finished isometric 3D rendering available on http:/bitsteller.bplaced.net/osm",
					 lastBuildDate = datetime.now(),
					 items=items)

	rss.write_xml(open("finishedRenderings.rss", "w"))
	execute_cmd("Moving finishedRenderings.rss", "cp status.json output/finishedRenderings.rss")
	upload_file("finishedRenderings.rss")

#main update method
def update_city(id):
	status_start(id)
	download_city(id)
	render_tiles(id)
	generate_tiles(id)
	upload_tiles(id)
	tweet_finished(id)
	generate_feed()
								
def getNumberOfTiles(top,left,bottom,right):
	#compute tile numbers to render
	mintile_x, mintile_y = deg2tile(float(top),float(left),12)
	maxtile_x, maxtile_y = deg2tile(float(bottom),float(right),12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	
	numberoftiles = (maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1)
	return numberoftiles


def expand_city(id):
	city = [city for city in cities["cities"] if city["city_id"] == id][0]
	
	top = round(float(city["area"]["top"]),2)
	left = round(float(city["area"]["left"]),2)
	bottom = round(float(city["area"]["bottom"]),2)
	right = round(float(city["area"]["right"]),2)

	numberoftiles = getNumberOfTiles(top,left,bottom,right)

	print("Original: ")
	print(' top="' + str(top) + '" left="' + str(left) + '" bottom="' + str(bottom) + '" right="' + str(right) + '"')
	print("Number of tiles: " + str(numberoftiles))

	while getNumberOfTiles(top,left,bottom,right) == numberoftiles:
		top += 0.01
	top -= 0.01

	while getNumberOfTiles(top,left,bottom,right) == numberoftiles:
		left -= 0.01
	left += 0.01

	while getNumberOfTiles(top,left,bottom,right) == numberoftiles:
		bottom -= 0.01
	bottom += 0.01

	while getNumberOfTiles(top,left,bottom,right) == numberoftiles:
		right += 0.01
	right -= 0.01
	print("Suggested:")
	print(' top="' + str(top) + '" left="' + str(left) + '" bottom="' + str(bottom) + '" right="' + str(right) + '"')

	if confirm("Do you want to overwrite the old bounds with the suggested ones?", default=False):
		city["area"]["top"] = str(top)
		city["area"]["left"] = str(left)
		city["area"]["bottom"] = str(bottom)
		city["area"]["right"] = str(right)

		s = json.dumps(cities, indent=3)
				
		f = open("cities.json", 'w')
		f.write(s + "\n")
		f.close()

def version():
	print("This is " + application_name + " " + version_number)

def help():
	version()
	name = "make.py"
	print("")
	print("Available commands:")
	print(" " + name + " " + "version" + " - " + "output version number")
	print(" " + name + " " + "help" + " - " + "this help")
	print(" " + name + " " + "post <city> <state> <msg>" + " - " + "post message to website")
	print(" " + name + " " + "update <city>" + " - " + "render and upload city")
	print(" " + name + " " + "render <city>" + " - " + "render city")
	print(" " + name + " " + "upload <city>" + " - " + "upload city")
	print(" " + name + " " + "password" + " - " + "reset pasword stored in keychain")
	print(" " + name + " " + "expand" + " - " + "compute city bounds that minimize the unused border")	

#Main program
signal.signal(signal.SIGINT, signal_handler) #abort on CTRL-C
if len(sys.argv)>1:
	action = sys.argv[1]
	if action=="version":
		version()
	elif action=="help":
		help()
	elif action=="password":
		prepare_ftp(True) #change password
	elif len(sys.argv)>2:
		city_id = sys.argv[2]
		init_status(city_id)
		if action=="post" and len(sys.argv)==4:
			status_failed(city_id, sys.argv[3])
		elif action=="update" and len(sys.argv)==3:
			update_city(city_id)
		elif action=="render" and len(sys.argv)==3:
			download_city(city_id)			
			render_tiles(city_id)
			generate_tiles(city_id)
		elif action=="upload" and len(sys.argv)==3:
			upload_tiles(city_id)
		elif action=="download" and len(sys.argv)==3:
			download_city(city_id)
		elif action=="expand" and len(sys.argv)==3:
			expand_city(city_id)
		else:
			print("FAILED: Wrong number of arguments for action or unkown action")
		status_cleanup()
	else:
		print("FAILED: Wrong number of arguments for action or unkown action")
else:
	print("FAILED: You need to specifiy an action")
