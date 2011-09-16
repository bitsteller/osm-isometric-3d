/*-----------------------------------------*/
/* Common                                  */
/*-----------------------------------------*/

var citiesXml = null;
var map=null;
var current_city_id = "";

var measures = {
	second: 1,
	minute: 60,
	hour: 3600,
	day: 86400,
	week: 604800,
	month: 2592000,
	year: 31536000
};

function long2tile(lon,zoom) { return ((lon+180)/360*Math.pow(2,zoom)); }
function lat2tile(lat,zoom)  { return ((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)); }

function tile2long(x,z) {
	return (x/Math.pow(2,z)*360-180);
}
function tile2lat(y,z) {
	var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
	return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
}

function loadCitiesXml() {
	var req = new XMLHttpRequest();
	req.open("GET", "cities.xml", false); 
	req.send(null);
	citiesXml = req.responseXML;		
}

function getHumanReadableDate(date) {
	var dateStr, amount,
		current = new Date().getTime(),
		diff = (current - date.getTime()) / 1000;

	if(diff > measures.week) {
		dateStr = date.getFullYear() + "-";
		if (date.getMonth()+1 < 10) 
			dateStr += "0";
		dateStr += (date.getMonth()+1) + "-";
		if (date.getDate() < 10)
			dateStr += "0";
		dateStr += date.getDate();
	}
	else if(diff > measures.day) {
		amount = Math.round(diff/measures.day);
		dateStr = ((amount > 1) ? amount + " " + "days ago":"one day ago");
	} 
	else if(diff > measures.hour) {
		amount = Math.round(diff/measures.hour);
		dateStr = ((amount > 1) ? amount + " " + "hour" + "s":"an " + "hour") + " ago";
	} 
	else if(diff > measures.minute) {
		amount = Math.round(diff/measures.minute);
		dateStr = ((amount > 1) ? amount + " " + "minute" + "s":"a " + "minute") + " ago";
	} 
	else {
		dateStr = "a few seconds ago";
	}

	return dateStr;
}

/*-----------------------------------------*/
/* for index.html                          */
/*-----------------------------------------*/

function refreshCityTable() {
  	loadCitiesXml();
  	
  	//clear table
 	var table = document.getElementById("city_list").getElementsByTagName("tbody")[0];
	while (table.firstElementChild) {
 		table.removeChild(table.firstElementChild);
	}
 	
 	var city_iterator = citiesXml.evaluate("//cities/city/@id" , citiesXml, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
 	var city = city_iterator.iterateNext();
 	var working = false;
	while (city) {
		var city_id = city.textContent;		
		var city_name = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		var stats_last_rendering_finished = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/stats/@last-rendering-finished" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		var state_date = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@date" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		var state_type = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@type" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		var state_message = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@message" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		 var row = document.createElement("tr");
		 var cell1 = document.createElement("td");
		 var link = document.createElement("a");
		 link.setAttribute("href", "map.html#" + city_id);
		 link.innerHTML = city_name;
		 cell1.appendChild(link);
		 var cell2 = document.createElement("td");
		 if (stats_last_rendering_finished == "") {
		 	cell2.innerHTML = "n/a";
		 }
		 else {
		 	try {
		 		var date = new Date(parseInt(stats_last_rendering_finished));
		 		cell2.innerHTML = getHumanReadableDate(date);
		 	}
		 	catch (err) {
		 		cell2.innerHTML = stats_last_rendering_finished;
		 	}
		 }
		 var cell3 = document.createElement("td");
		 if (state_type == "READY") {
		 	cell3.innerHTML = "";
		 }
		 else {
		 	if (state_type =="WORKING") {
		 		working=true;
		 	}
		 	
		 	cell3.innerHTML += state_message;
		 	try {
		 		var date_state = new Date(parseInt(state_date));
		 		cell3.innerHTML += '<br/><div class="timestamp">' + getHumanReadableDate(date_state) + "</div>";
		 	}
		 	catch (err) {
				
		 	}
		 }
		 row.appendChild(cell1);
		 row.appendChild(cell2);
		 row.appendChild(cell3);
		 table.appendChild(row);
  		city = city_iterator.iterateNext();
	}
	if (working == true) {
		setTimeout("refreshCityTable()",5000); //reload every 5 secs
	}
	else {
		setTimeout("refreshCityTable()",60000); //reload every minute
	}

}
 
function initIndex() {
	refreshCityTable();
}

/*-----------------------------------------*/
/* for map.html                            */
/*-----------------------------------------*/

function refreshState(repeat) {
	loadCitiesXml();
	var city_id = current_city_id;
	var city_name = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
	if (city_name == "") {
		document.getElementById("state").data = "Last update: unkown";
		return;
	}
	var stats_last_rendering_finished = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/stats/@last-rendering-finished" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
	var state_date = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@date" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
	var state_type = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@type" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
	var state_message = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/state/@message" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
	//update state info
	var div=document.getElementById("state");
	var working = false;
	if (state_type == "WORKING") {
		working=true;
	 	div.innerHTML = state_message;
	 	try {
	 		var date_state = new Date(parseInt(state_date));
	 		div.innerHTML += '<br/><div class="timestamp">' + getHumanReadableDate(date_state) + "</div>";
	 	}
	 	catch (err) {
		
	 	}
	 }
	 else {
	 	var lastUpdateStr = "Last update: ";
	 	if (stats_last_rendering_finished == "") {
	 		lastUpdateStr += "n/a";
		}
		else {
			try {
		 		var date = new Date(parseInt(stats_last_rendering_finished));
		 		lastUpdateStr += getHumanReadableDate(date);
		 	}
		 	catch (err) {
		 		lastUpdateStr += stats_last_rendering_finished;
		 	}
		}
		div.innerHTML = '<div class="timestamp">' + lastUpdateStr + "</div>";
	 }
	 
	 if (repeat) {
	  	if (working) {
			setTimeout('refreshState(true)',5000); //reload every 5 secs
		}
		else {
			setTimeout('refreshState(true)',60000); //reload every minute
		}
	 }
}

function getCityByLatLon(lat,lon) {
	loadCitiesXml();
	var city_iterator = citiesXml.evaluate("//cities/city/@id" , citiesXml, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
	var select=document.getElementById("city_select");

	var city = city_iterator.iterateNext();
	while (city) {
		var city_id = city.textContent;		
		var area_left = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@left" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_top = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@top" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_right = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@right" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_bottom = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@bottom" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		
		if (area_bottom <= lat && lat <= area_top && area_left <= lon && lon <= area_right) {
			return city_id;
		}
		city = city_iterator.iterateNext();
	}
	return "";
}

function loadCity() {
	//set map center and zoom
	 if (location.href.indexOf("#") != -1) {
		loadCitiesXml();
		var city_id = location.href.substr(location.href.indexOf("#")+1);
		var city_name = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		if (city_name != "") {
			//get values from cities.xml
			var area_left = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@left" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
			var area_top = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@top" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
			var area_right = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@right" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
			var area_bottom = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@bottom" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
			
			map.centerAndZoom(new khtml.maplib.LatLng(tile2lat(lat2tile((area_top+area_bottom)/2.0,12)/2.0,12),(area_left+area_right)/2.0),13);
		   current_city_id = city_id;
		}
		else {
			var location_str = location.href.substr(location.href.indexOf("#")+1);
			var position = location_str.split(",");
			if (position.length == 2 || position.length==3) { //url format: map.html#lat,lon[,zoom]
				try {
					var lat = parseFloat(position[0]);
					var lon = parseFloat(position[1]);
					var zoom = 14; //default zoom
					if (position.length==3) {
						zoom = parseInt(position[2]);
					}
					map.centerAndZoom(new khtml.maplib.LatLng(tile2lat(lat2tile((lat),12)/2.0,12),(lon)),zoom);
					city_id = getCityByLatLon(lat,lon);
					if (city_id == "") {
						alert("404 - Sorry, the position is out of any rendered area.");
					}
					current_city_id = city_id;
					city_name = citiesXml.evaluate("//cities/city[@id='" + current_city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
				}
				catch (err) {
					alert("404 - Parsing coordinates failed. Check the URL format.");
				}
			}
			else {
				alert("404 - City not found");
			}
		}
		//update page title
		document.title = "3D map of " + city_name;
		 var select=document.getElementById("city_select");
		 for (var i = 0; i < select.length; i++) {
		 	if (select.options[i].value == city_id) {
		 		select.options[i].selected = true;
		 	}
		 	else {
		 		select.options[i].selected = false;
		 	}
		 }
		 refreshState(false);
	 }
}
 
function selectedCity() {
  var select=document.getElementById("city_select");
  var wert = select.options[select.options.selectedIndex].value;
  location.href = "map.html#" + wert;
}
 
function initMap(){
	//initialize map
	map=new khtml.maplib.Map(document.getElementById("map"));

	map.tiles({
	  maxzoom:15,
	  minzoom:12,
	  src:function(x,y,z){
		  return "tiles/"+z+"/"+x+"/"+y+".png";
	  },
	  copyright:"osm"
	})

	loadCitiesXml();
	var city_iterator = citiesXml.evaluate("//cities/city/@id" , citiesXml, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
	var select=document.getElementById("city_select");

	var city = city_iterator.iterateNext();
	while (city) {
		var city_id = city.textContent;		
		var city_name = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
		newOption = new Option(city_name, city_id);
		select.options[select.length] = newOption;
		city = city_iterator.iterateNext();
	}

	loadCity();
	window.onhashchange = loadCity;
	refreshState(true);
}
