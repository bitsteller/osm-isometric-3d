from lxml import etree
import sys
import signal
import os, stat, time
from datetime import datetime,timedelta
import getpass
import ftplib
#import gnomekeyring as gk
#import glib
import keyring
import shutil
import math
import Image

#====USER OPTIONS====

OPTION_ENABLE_TWITTER = True

COMMAND_CURL = "curl -OL" #if you don't have curl installed, you can change this to COMMAND_CURL = "wget"
COMMAND_OSMOSIS = "osmosis/osmosis-0.39/bin/osmosi"
COMMAND_OSM2POV = "osm2pov/osm2pov"
COMMAND_POVRAY = "povray"
COMMAND_MOGRIFY = "mogrify"
COMMAND_TWIDGE = "twidge/twidge-1.0.6-linux-i386-bin"

DIR_OSM2POV = "osm2pov"

#====================


application_name = "osm2pov-make"
version_number = "0.2.0"

cities = etree.parse("cities.xml")
city_id = ""

ftp_init = False
ftp_user = ""
ftp_url = ""
ftp_password = ""
ftp_path = ""

date_start = ""
date_end = ""


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

def prepare_ftp():
	global ftp_url, ftp_user, ftp_password, ftp_init, ftp_path, keyring_name
	if ftp_init == False:
		root = cities.getroot()
		server = root.xpath("server")[0]
		ftp_url = server.get("url")
		ftp_user = server.get("user")
		ftp_path = server.get("path")
		
		ftp_password = keyring.get_password(ftp_url, ftp_user)
		if ftp_password == None:
			while 1:
				print(application_name + " needs a password to continue. Please enter the password for")
				print(" * service: ftp")
				print(" * domain: " + ftp_url)
				print(" * user: " + ftp_user)
				print("to continue. Hint: To change the username and the domain, you have to edit cities.xml.")
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
	except: raise Exception("Uploading file '" + filename + "' failed.")
	
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
		
def update_city_state(id, state_type, message):
	print ("Updating state of city '" + id + "' to '" + state_type + " (" + message + ")'...")
	root = cities.getroot()
	city = root.xpath("city[@id='" + id + "']")[0]
	
	if (len(city.xpath("state")) == 0):
		etree.SubElement(city, "state")
	state = city.xpath("state")[0]
	
	#Update state data
	state_date = str(int(time.time()*1000))
	state.set("date", state_date)
	state.set("type",state_type)
	state.set("message",message)
	
	print("Writing cities.xml...")
	cities.write("cities.xml")

	if not(os.path.exists("output")):
		os.mkdir("output")
	
	execute_cmd("Moving cities.xml", "cp cities.xml output/cities.xml")
	upload_file("cities.xml")

def update_city_stats(id):
	global date_start, date_end
	
	print("Updating stats of city '" + id + "'...")
	root = cities.getroot()
	city = root.xpath("city[@id='" + id + "']")[0]
	
	#Update statistics
	if (len(city.xpath("stats")) == 0):
		etree.SubElement(city, "stats")
	stats = city.xpath("stats")[0]
	
	area = root.xpath("city[@id='" + id + "']/area")[0]
	mintile_x, mintile_y = deg2tile(float(area.get("top")),float(area.get("left")),12)
	maxtile_x, maxtile_y = deg2tile(float(area.get("bottom")),float(area.get("right")),12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	
	numberoftiles = ((maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1))
	totalnumberoftiles = numberoftiles * (1*1 + 2*2 + 4*4 + 8*8) #zoom from 12 to 15
	
	stats.set("tiles", str(numberoftiles))
	stats.set("total-tiles",str(totalnumberoftiles))
	stats.set("last-rendering-start",date_start)
	stats.set("last-rendering-finished",date_end)
	
	print("Writing cities.xml...")
	cities.write("cities.xml")

# Download a osm file
def download_osm(source):
	filename = source.split("/")[-1]
	
	if file_exists(filename) == False:
		execute_cmd("Downloading '" + source + "'", COMMAND_CURL + " " + source)

# Trim a osm file
def trim_osm(sourcefile, id, top, left, bottom, right):
	filename = id + ".osm"
	
	if file_exists(filename) == False:
		command  = COMMAND_OSMOSIS + ' '
		command += '--read-bin file="' + sourcefile + '" '
		command += '--bounding-box top=' + top + ' left=' + left + ' bottom=' + bottom + ' right=' + right + ' '
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
	root = cities.getroot()
	area = root.xpath("city[@id='" + id + "']/area")[0]
	mintile_x, mintile_y = deg2tile(float(area.get("top")),float(area.get("left")),12)
	maxtile_x, maxtile_y = deg2tile(float(area.get("bottom")),float(area.get("right")),12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	
	numberoftiles = (maxtile_x - mintile_x + 1) * (maxtile_y - mintile_y + 1)
	tilecount = 0
	
	#render the tiles
	osmfile = id + ".osm"
	for x in range(mintile_x, maxtile_x + 1):
		for y in range(mintile_y, maxtile_y + 1):
			tilecount += 1
			povfile = id + "-" + str(x) + "_" + str(y) + ".pov"
			pngfile = id + "-" + str(x) + "_" + str(y) + ".png"
			tileinfo = "tile " + str(tilecount) + "/" + str(numberoftiles)
			update_city_state(id, "WORKING", "Rendering " + tileinfo + "...")
			execute_cmd("Generating pov file for city '" + id + "', " + tileinfo, COMMAND_OSM2POV + " " + osmfile + " " + povfile + " " + str(x) + " " + str(y))
			execute_cmd("Rendering city '" + id + "', " + tileinfo, COMMAND_POVRAY + " +W2048 +H2048 +B100 -D +A " + povfile)
			os.remove(povfile)
			execute_cmd("Compressing image file of city '" + id + "'" + tileinfo, COMMAND_MOGRIFY + " -quality 15 " + pngfile)
			if not(os.path.exists(tempdir + "/" + str(x))):
				os.mkdir(tempdir + "/" + str(x))
			execute_cmd("Moving output file of city '" + id + "'" + tileinfo, "mv " + pngfile + " " + tempdir+"/"+str(x)+"/"+str(y)+".png")

def generate_tiles(id):
	#make sure that tile dir exists
	if not(os.path.exists("output/tiles")):
		os.mkdir("output/tiles")
	tiledir = "output/tiles"
	
	#compute tile numbers rendered
	root = cities.getroot()
	area = root.xpath("city[@id='" + id + "']/area")[0]
	mintile_x, mintile_y = deg2tile(float(area.get("top")),float(area.get("left")),12)
	maxtile_x, maxtile_y = deg2tile(float(area.get("bottom")),float(area.get("right")),12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	
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
						if (tilecount % 34 == 0):
							tileinfo = "tile " + str(tilecount) + "/" + str(numberoftiles)
							update_city_state(id, "WORKING", "Scaling and cutting, " + tileinfo + "...")
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

def upload_tiles(id):
	global ftp_url, ftp_user, ftp_password, ftp_init, ftp_path
	
	#compute tile numbers rendered
	root = cities.getroot()
	area = root.xpath("city[@id='" + id + "']/area")[0]
	mintile_x, mintile_y = deg2tile(float(area.get("top")),float(area.get("left")),12)
	maxtile_x, maxtile_y = deg2tile(float(area.get("bottom")),float(area.get("right")),12)
	mintile_y = int(math.floor((mintile_y/2)))
	maxtile_y = int(math.ceil((maxtile_y/2)))
	
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
						print("Uploading tile (zoom=" + str(zoom) + ", x=" + str(tile_x) + ", y=" + str(tile_y) + ")...")
						if (tilecount % 34 == 0):
							tileinfo = "tile " + str(tilecount) + "/" + str(numberoftiles)
							update_city_state(id, "WORKING", "Uploading, " + tileinfo + "...")
						
						try:	
							f = open("output/tiles/" + str(zoom) + "/" + str(tile_x) + "/" + str(tile_y) + ".png",'rb')
							dot_storbinary(s,'STOR ' + str(tile_y) + ".png", f)
							f.close()
						except: raise Exception("Uploading tile (zoom=" + str(zoom) + ", x=" + str(x) + ", y=" + str(y) + ") failed.")
						
						print("Uploading tile (zoom=" + str(zoom) + ", x=" + str(tile_x) + ", y=" + str(tile_y) + ") finished.")
					s.cwd("..")
		s.cwd("..")                           
	s.quit()

def download_city(id):
	root = cities.getroot()
	city = root.xpath("city[@id='" + id + "']")[0]
	area = city.xpath("area")[0]
	
	source = area.get("osm")
	download_osm(source) #Download .pbf

	top = area.get("top")
	left = area.get("left")
	bottom = area.get("bottom")
	right = area.get("right")
	filename = source.split("/")[-1]
	trim_osm(filename, id, top, left, bottom, right) #Trim and convert to .osm
	
def update_city(id):
	global date_start, date_end
	
	date_start = str(int(time.time()*1000))
	update_city_state(id, "WORKING", "Preparing rendering...")
	download_city(id)
	update_city_state(id, "WORKING", "Rendering city...")
	render_tiles(id)
	update_city_state(id, "WORKING", "Cutting and scaling..")
	generate_tiles(id)
	update_city_state(id, "WORKING", "Uploading...")
	upload_tiles(id)
	update_city_state(id, "WORKING", "Updating statistics...")
	date_end = str(int(time.time()*1000))
	update_city_stats(id)
	update_city_state(id, "WORKING", "Tweeting state...")
	root = cities.getroot()
	city = root.xpath("city[@id='" + id + "']")[0]
	if OPTION_ENABLE_TWITTER:
		execute_cmd("Updating twitter status", COMMAND_TWIDGE + ' update "' + "Updated isometric 3D map of " + city.get("name") + ' http://bitsteller.bplaced.net/osm' + ' #OpenStreetMap"', True)
	update_city_state(id, "READY", "")
	
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

#Main program
signal.signal(signal.SIGINT, signal_handler) #abort on CTRL-C
if len(sys.argv)>1:
	action = sys.argv[1]
	if action=="version":
		version()
	elif action=="help":
		help()
	elif len(sys.argv)>2:
		city_id = sys.argv[2]
		if action=="post" and len(sys.argv)==5:
			update_city_state(city_id, sys.argv[3], sys.argv[4])
		elif action=="update" and len(sys.argv)==3:
			update_city(city_id)
		elif action=="render" and len(sys.argv)==3:
			render_tiles(city_id)
			generate_tiles(city_id)
		elif action=="upload" and len(sys.argv)==3:
			upload_tiles(city_id)
			update_city_state(city_id, "READY", "")
		elif action=="download" and len(sys.argv)==3:
			download_city(city_id)
		else:
			print("FAILED: Wrong number of arguments for action or unkown action")
	else:
		print("FAILED: Wrong number of arguments for action or unkown action")
else:
	print("FAILED: You need to specifiy an action")
