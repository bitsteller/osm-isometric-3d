/*-----------------------------------------*/
/* Common                                  */
/*-----------------------------------------*/

var citiesXml = null;
var map=null;
var current_city_id = "";
var marker = null;

var measures = {
	second: 1,
	minute: 60,
	hour: 3600,
	day: 86400,
	week: 604800,
	month: 2592000,
	year: 31536000
};

(function() {
	var s = document.createElement('script'), t = document.getElementsByTagName('script')[0];
	s.type = 'text/javascript';
	s.async = true;
	s.src = 'http://api.flattr.com/js/0.6/load.js?mode=auto';
	t.parentNode.insertBefore(s, t);
})();

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

function showMessage(title, innerHTML) {
	hideMessage();
   var overlay = document.createElement("div");
   overlay.setAttribute("id","overlay");
   overlay.setAttribute("class", "overlay");
   
   var error = document.createElement("div");
   error.setAttribute("id","message");
   error.setAttribute("class", "message");
   error.innerHTML = "<h2>" + title + "</h2>" + innerHTML;
   
   document.body.appendChild(error);
   document.body.appendChild(overlay);
}

function hideMessage() {
	try {
		var error = document.getElementById("message");
		document.body.removeChild(error);
	}
	catch (err) {
	
	}
	try {
		var overlay = document.getElementById("overlay");
		document.body.removeChild(overlay);
	}
	catch (err) {
	
	}
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
		var area_left = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@left" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_top = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@top" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_right = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@right" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;
		var area_bottom = citiesXml.evaluate("//cities/city[@id='" + city_id + "']/area/@bottom" , citiesXml, null, XPathResult.NUMBER_TYPE, null).numberValue;

		 var row = document.createElement("tr");
		 var cell0 = document.createElement("td");
		 var image = document.createElement("img");
		 image.setAttribute("src", "tiles/14/" + Math.round(long2tile((area_left+area_right)/2.0,14)) + "/" + Math.round(lat2tile((area_top+area_bottom)/2.0,14)/2.0) + ".png");
		 image.setAttribute("class", "thumbnail");
		 cell0.appendChild(image);
		 
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
		 row.appendChild(cell0);
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

function loadPermalink() {
	var center = map.getCenter();
	var lat = tile2lat(lat2tile(center.lat,12)* 2.0,12);
	var lon = center.lng;
	location.href = "map.html#" + lat + "," + lon + "," + map.getZoom();
}

function loadCity() {
	hideMessage();
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
			
            var latlong = new L.LatLng(tile2lat(lat2tile((area_top+area_bottom)/2.0,12)/2.0,12), (area_left+area_right)/2.0); 
            map.setView(latlong, 13);
		   current_city_id = city_id;
		}
		else {
			var location_str = location.href.substr(location.href.indexOf("#")+1);
			var position = location_str.split(",");
			if (position.length == 2 || position.length==3) { //url format: map.html#lat,lon[,zoom]
				var lat = parseFloat(position[0]);
				var lon = parseFloat(position[1]);
				var zoom = 14; //default zoom
				if (position.length==3) {
					zoom = parseInt(position[2]);
				}
                var latlong = new L.LatLng(tile2lat(lat2tile((lat),12)/2.0,12), lon); 
                map.setView(latlong, zoom);
                
                if (marker != null) {
                    map.removeLayer(marker);
                }
                if (zoom >= 15) {
                    marker = new L.Marker(latlong);
                    map.addLayer(marker);
                }

				city_id = getCityByLatLon(lat,lon);
				if (city_id == "") {
					showMessage("Error 404: Not found", "Sorry, but the position '" + location_str + "' is out of any rendered area or the URL couldn't be parsed. " + '<br/><br/>Try the following: <ul><li>Check the URL</li> <li>click <a href="index.html">here</a> to get a list of available cities</li>');
				}
				current_city_id = city_id;
				city_name = citiesXml.evaluate("//cities/city[@id='" + current_city_id + "']/@name" , citiesXml, null, XPathResult.STRING_TYPE, null).stringValue;
			}
			else {
				showMessage("Error 404: Not found", "Sorry, but the city with the ID '" + location.href.substr(location.href.indexOf("#")+1) + "' was not found. " + '<br/><br/>Try the following: <ul><li>Check the URL</li> <li>click <a href="index.html">here</a> to get a list of available cities</li>');
			}
		}
		//update page title and city list
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

function keyUp (event) {
    var keycode;
    if (!event)
        event = window.event;
    if (event.which) {
        keycode = event.which;
    } else if (event.keyCode) {
        keycode = event.keyCode;
    }

    switch (keycode) {
        case 37: {
            map.panBy(new L.Point(-40, 0));
            break;
        }
        case 38: {
            map.panBy(new L.Point(0, -40));	
            break;
        }
        case 39: {
            map.panBy(new L.Point(40, 0));	
            break;
        }
        case 40: {
            map.panBy(new L.Point(0, 40));	
            break;
        }
    }
}

function located(e) {
    location.href = "map.html#" + e.latlng.lat + "," + e.latlng.lng + "," + map.getZoom();
    loadCity();
}

function locate() {
    map.locate({maxZoom:15, setView:true, enableHighAccuracy:true});
}
 
function initMap(){
	//initialize map
    map = new L.Map('map');

    var iso3d = new L.TileLayer('../tiles/{z}/{x}/{y}.png', {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        maxZoom: 15,
        minZoom: 12
    });
    
    map.addLayer(iso3d);
    
    //setup event handlers
    document.onkeyup = keyUp;
    map.on('locationfound', located);

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
