from lxml import etree
import json

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

#main program

cities = etree.parse("cities.xml")
root = cities.getroot()
cities_json = []
for city_xml in root.findall("city"):
	print("Converting " + city_xml.get("id") + "...")
	area_xml = city_xml.find("area")
	area_json = { "top": float(area_xml.get("top")),
				  "left": float(area_xml.get("left")),
				  "bottom": float(area_xml.get("bottom")),
				  "right": float(area_xml.get("right"))
				}
	city_json = { "city_id": city_xml.get("id"),
				  "source": area_xml.get("osm"),
				  "name": city_xml.get("name"),
				  "area": area_json
				}
	cities_json.append(city_json)
print(str(len(cities_json)) + " cities have been converted.")

if confirm("Do you want to save the cities to the file 'converted_cities.json'? Attention: If the file already exists it will be overwritten!", default=False):
	s = json.dumps({"version": 1, "cities": cities_json}, indent=3)
	f = open("converted_cities.json", 'w')
	f.write(s + "\n")
	f.close()
	print("Converted cities have been saved as 'converted_cities.json'. To use the file as an input for make.py rename it to 'cities.json'.")
