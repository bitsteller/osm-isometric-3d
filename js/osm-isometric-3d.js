/*-----------------------------------------*/
/* Common                                  */
/*-----------------------------------------*/

var cities = {};
var map = null;
var current_city = null;
var marker = null;

var Modes = {
	INDEX: 0,
	MAP: 1
};

var mode = Modes.INDEX;

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

function loadCities() {
	var req = new XMLHttpRequest();
	req.open("GET", "cities.json", false); 
	req.send(null);
	cities = JSON.parse(req.responseText)["cities"];
}

function loadStatus() {
	var http_request = new XMLHttpRequest();
	http_request.open("GET", "status.json", true);
	http_request.onreadystatechange = function () {
		var done = 4, ok = 200;
		if (http_request.readyState == done && http_request.status == ok) {
			var cities_status = JSON.parse(http_request.responseText)["cities"];
			if (mode == Modes.INDEX) {
				refreshCityTable(cities_status);
			}
			else if (mode == Modes.MAP) {
				refreshState(cities_status);
			}
		}
	};
	http_request.send(null);
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

function getStatusByCityId(cities_status, id) {
	for (var i = 0; i < cities_status.length; i++) {
		var status = cities_status[i];
		if (status.city_id == id) {
			return status;
		}
	}
	return null;
}


/*-----------------------------------------*/
/* for index.html                          */
/*-----------------------------------------*/

function refreshCityTable(cities_status) {
  	//clear table
 	var table = document.getElementById("city_list").getElementsByTagName("tbody")[0];
	while (table.firstElementChild) {
 		table.removeChild(table.firstElementChild);
	}
 	
 	var working = false;
	var city = null;
	for (var i = 0; i<this.cities.length; i++) {
		city = this.cities[i];
		 var row = document.createElement("tr");
		//Thumbnail
		 var cell0 = document.createElement("td");
		 var image = document.createElement("img");
		 image.setAttribute("src", "tiles/14/" + Math.round(long2tile((city.area.left + city.area.right)/2.0,14)) + "/" + Math.round(lat2tile((city.area.top + city.area.bottom)/2.0,14)/2.0) + ".png");
		 image.setAttribute("class", "thumbnail");
		 cell0.appendChild(image);
		
		//Name and link
		 var cell1 = document.createElement("td");
		 var link = document.createElement("a");
		 link.setAttribute("href", "map.html#" + city.city_id);
		 link.innerHTML = city.name;
		 cell1.appendChild(link);
		
		//Last update
		var status = getStatusByCityId(cities_status, city.city_id);
		
		var last_rendering_finished = 0;
		if (status != null) {
			var max_id = 0;
			for (var j = 0; j < status.renderings.length; j++) {
				var rendering = status.renderings[j];
				if (rendering.rendering_id > max_id) {
					max_id = rendering.rendering_id
					if (rendering.succesful) {
						last_rendering_finished = rendering.end;
					}
				}
			}
		}

		 var cell2 = document.createElement("td");
		 if (last_rendering_finished == 0) {
		 	cell2.innerHTML = "n/a";
		 }
		 else {
		 	try {
		 		var date = new Date(parseInt(last_rendering_finished));
		 		cell2.innerHTML = getHumanReadableDate(date);
		 	}
		 	catch (err) {
		 		cell2.innerHTML = last_rendering_finished;
		 	}
		 }
		
		//Status
		 var cell3 = document.createElement("td");
		//cell3.title="test";
		if (status != null) {
			if (status.status.type == "READY") {
				cell3.innerHTML = "";
			}
			else {
				if (status.status.type =="WORKING") {
					working=true;
				}
				var canvas = document.createElement("canvas");
				canvas.style.paddingRight = 3;
				canvas.width = 14;
				canvas.height = 14;
				canvas.title = status.status.step + "/" + status.status.total_steps;
				var context = canvas.getContext("2d");
				context.fillStyle = "rgb(80,80,80)";
				context.beginPath();
				context.moveTo(7,7);
				var endAngle = 1.0*status.status.step/status.status.total_steps*2.0*Math.PI - 0.5*Math.PI;
				context.arc(7, 7, 6, -0.5*Math.PI, endAngle, false);
				context.fill();
				context.strokeStyle = "rgb(150,150,150)";
				context.beginPath();
				context.arc(7, 7, 6, 0.0, 2.0*Math.PI, false);
				context.stroke();

				cell3.appendChild(canvas);
				
				cell3.appendChild(document.createTextNode(status.status.description));
				cell3.appendChild(document.createElement("br"));
								  
				var date_state_hr = "n/a";
				try {
					var date_state = new Date(parseInt(status.status.time));
					try {
						date_state_hr = getHumanReadableDate(date_state);
					}
					catch (err) {
						date_state_hr = last_rendering_finished;
					}
				}
				catch (err) {
					
				}
				var timestamp = document.createElement("div");
				timestamp.className = "timestamp";
				timestamp.innerHTML = date_state_hr;

				cell3.appendChild(timestamp);
			}
		}

		 row.appendChild(cell0);
		 row.appendChild(cell1);
		 row.appendChild(cell2);
		 row.appendChild(cell3);
		 table.appendChild(row);
	}
	if (working == true) {
		setTimeout("loadStatus()",5000); //reload every 5 secs
	}
	else {
		setTimeout("loadStatus()",60000); //reload every minute
	}

}
 
function initIndex() {
	mode = Modes.INDEX;
	loadCities();
	loadStatus();
}

/*-----------------------------------------*/
/* for map.html                            */
/*-----------------------------------------*/

function getCityById(city_id) {
	var city = null;
	for (var i = 0; i < this.cities.length; i++) {
		city = this.cities[i];
		if (city.city_id == city_id) {
			return city;
		}
	}
	return null;
}

function getCityByLatLon(lat,lon) {
	var select=document.getElementById("city_select");
	
	var city = null;
	for (var i = 0; i < this.cities.length; i++) {
		city = this.cities[i];

		if (city.area.bottom <= lat && lat <= city.area.top && city.area.left <= lon && lon <= city.area.right) {
			return city;
		}
	}
	return null;
}

function refreshState(repeat) {
	var city_id = current_city_id; //TODO: not id
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

function loadPermalink() {
	var center = map.getCenter();
	var lat = tile2lat(lat2tile(center.lat,12)* 2.0,12);
	var lon = center.lng;
	location.href = "map.html#" + lat + "," + lon + "," + map.getZoom();
}

function loadCity() {
	hideMessage();
    if (marker != null) {
        map.removeLayer(marker);
    }
	//set map center and zoom
	 if (location.href.indexOf("#") != -1) {
		var city_id = location.href.substr(location.href.indexOf("#")+1);
		var city = getCityById(city_id);
		 
		if (city != null) {
            var latlong = new L.LatLng(tile2lat(lat2tile((city.area.top+city.area.bottom)/2.0,12)/2.0,12), (city.area.left+city.area.right)/2.0);
            map.setView(latlong, 13);
		    current_city = city;
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
                
                if (zoom >= 15) {
                    marker = new L.Marker(latlong);
                    map.addLayer(marker);
                }

				city = getCityByLatLon(lat,lon);
				if (city == null) {
                    var nearestCity = getNearestCityId(new L.LatLng(lat,lon));
                    if (nearestCity != null){
                        var msg = "The position '" + location_str + "' is out of any rendered area. " + '<br/><br/>Try the following: <ul>';
                        msg += '<li>Goto the nearest city: <a href="map.html#' + nearestCity.city_id + '">' + nearestCity.name + '</a>';
                        msg += '<li>Click <a href="index.html">here</a> to get a list of available cities</li></ul>';
                        showMessage("Sorry, but you're on a black spot!", msg);
                    }
                    else {
                        var msg = "Sorry, but the position '" + location_str + "' is out of any rendered area or the URL couldn't be parsed. " + '<br/><br/>Try the following: <ul>';
                        msg += '<li>Check the URL</li> <li>Click <a href="index.html">here</a> to get a list of available cities</li></ul>';
                        showMessage("Error 404: Not found", msg);
                    }

                                 
				}
				current_city = city;
			}
			else {
				showMessage("Error 404: Not found", "Sorry, but the city with the ID '" + location.href.substr(location.href.indexOf("#")+1) + "' was not found. " + '<br/><br/>Try the following: <ul><li>Check the URL</li> <li>Click <a href="index.html">here</a> to get a list of available cities</li></ul>');
			}
		 }
		 if (city != null) {
			 //update page title and city list
			 document.title = "3D map of " + city.name;
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
		 else {
			 document.title = "3D map";
		 }
	 }
     else {
         map.locate({maxZoom:15, setView:true, enableHighAccuracy:true});
     }
}
 
function selectedCity() {
  var select=document.getElementById("city_select");
  var wert = select.options[select.options.selectedIndex].value;
  location.href = "map.html#" + wert;
}

function getNearestCityId(position) {
    var nearestCity = null;
    var distance = 999999;
    
	var city = null;
	for (var i = 0; i < this.cities.length; i++) {
		city = this.cities[i];
        var center = new L.LatLng(city.area.bottom + (city.area.top - city.area.bottom)/2.0, city.area.left + (city.area.right - city.area.left)/2.0);
        if (position.distanceTo(center) < distance) {
            nearestCity = city;
            distance = position.distanceTo(center);
        }
	}
	return nearestCity;
}

function locate() {
    map.locate({maxZoom:15, setView:true, enableHighAccuracy:true});
}

function located(e) {
    location.href = "map.html#" + e.latlng.lat + "," + e.latlng.lng + "," + map.getZoom();
    loadCity();
}
 
function locationfailed(e) {
    var msg = "The geolocation process failed. " + e.message + '<br/><br/>Try the following: <ul>';
    msg += '<li>Try again</li> <li>Click <a href="index.html">here</a> to get a list of available cities</li></ul>';
    showMessage("Sorry, I couldn't find out where you are.", msg);
}


function initMap(){
	mode = Modes.MAP;
	//initialize map
    map = new L.Map('map');

    var iso3d = new L.TileLayer('tiles/{z}/{x}/{y}.png', {
        attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
        maxZoom: 15,
        minZoom: 12
    });
    
    map.addLayer(iso3d);
    
    //setup event handlers
    map.on('locationfound', located);
    map.on('locationerror', locationfailed);


	loadCities();
	
	var select=document.getElementById("city_select");
	var city = null;
	for (var i = 0; i < this.cities.length; i++) {
		city = this.cities[i];
		newOption = new Option(city.name, city.city_id);
		select.options[select.length] = newOption;
	}

	loadCity();
	window.onhashchange = loadCity;
	refreshState(true);
}
