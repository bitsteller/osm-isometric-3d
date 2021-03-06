/*-----------------------------------------*/
/* Common                                  */
/*-----------------------------------------*/

var cities = {};
var map = null;
var current_city = null;
var marker = null;
var working = false;
var cached_cities_status = {};

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

function loadStatus(repeat) {
	var http_request = new XMLHttpRequest();
	http_request.open("GET", "status.json?bustCache=" + Math.random(), true);
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
			if (this.working == true && repeat) {
				setTimeout("loadStatus(true)",5000); //reload every 5 secs
			}
			else {
				setTimeout("loadStatus(true)",60000); //reload every minute
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
	overlay.setAttribute("onClick", "hideMessage()");
   
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
		if (overlay.style.animationName !== undefined) {
			overlay.addEventListener('animationEnd', function(){
									 document.body.removeChild(overlay);
									 }, false);
			overlay.style.animationName = "fadeOut";
		}
		else if (overlay.style.webkitAnimationName !== undefined) {
			overlay.addEventListener('webkitAnimationEnd', function(){
									 document.body.removeChild(overlay);
									 }, false);
			overlay.style.webkitAnimationName = "fadeOut";
		}
		else if (overlay.style.mozAnimationName !== undefined) {
			overlay.addEventListener('mozAnimationEnd', function(){
									 document.body.removeChild(overlay);
									 }, false);
			overlay.style.mozAnimationName = "fadeOut";
		}
		else if (overlay.style.oAnimationName !== undefined) {
			overlay.addEventListener('oAnimationEnd', function(){
									 document.body.removeChild(overlay);
									 }, false);
			overlay.style.oAnimationName = "fadeOut";
		}
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

function getRecentFinishedRenderings(status) {
	var succesfulRenderings = [];
	
	if (status != null) {
		for (var i = 0; i < status.renderings.length; i++) {
			var rendering = status.renderings[i];
			if (rendering.succesful) {
				succesfulRenderings.push (rendering);
			}
		}
	}
	
	if (succesfulRenderings.length >= 5) {
		succesfulRenderings = succesfulRenderings.slice (succesfulRenderings.length-6);
	}
	return succesfulRenderings;
}

function getAveragePhaseDuration(status, phase) {
	var succesfulRenderings = getRecentFinishedRenderings(status);
	var average = 0;
	for (var i = 0; i < succesfulRenderings.length; i++) {
		average += succesfulRenderings[i].durations[phase-1];
	}
	average = average / succesfulRenderings.length;
	return average;
}

function getWorkingStatusDiv(status) {
	var div = document.createElement("div");
	var canvas = document.createElement("canvas");
	canvas.style.paddingRight = 3;
	canvas.width = 14;
	canvas.height = 14;
	canvas.title = "Step " + status.status.step + "/" + status.status.total_steps;
	var context = canvas.getContext("2d");
	if (window.devicePixelRatio) {
		var width = canvas.width;
		var height = canvas.height;
		canvas.width = canvas.width * window.devicePixelRatio;
		canvas.height = canvas.height * window.devicePixelRatio;
		canvas.style.width = width;
		canvas.style.height = height;
		context.scale(window.devicePixelRatio, window.devicePixelRatio);
	}
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
	
	div.appendChild(canvas);
	
	div.appendChild(document.createTextNode(status.status.description));
	div.appendChild(document.createElement("br"));
	
	var timestamp = document.createElement("div");
	timestamp.className = "timestamp";
	if (getRecentFinishedRenderings(status).length >= 3) {
		var timeLeft = getAveragePhaseDuration(status, status.status.phase)*(status.status.total_steps-status.status.step)/status.status.total_steps
		for (var i = status.status.phase + 1; i <= status.status.total_phases; i++) {
			timeLeft += getAveragePhaseDuration(status, i);
		}
		timestamp.title = parseInt(timeLeft/1000/60) + " minutes left"

		var dateFinished = new Date(new Date().getTime() + timeLeft);
		timestamp.innerHTML= "New rendering available at " + dateFinished.getHours() + ":";
		timestamp.innerHTML+= (dateFinished.getMinutes() < 10 ? "0" + dateFinished.getMinutes(): dateFinished.getMinutes());
	}
	else {
		var date_state_hr = "";
		try {
			date_state_hr = getHumanReadableDate(new Date(status.status.time));
		}
		catch (err) {
			date_state_hr = "n/a";
		}

		timestamp.innerHTML = date_state_hr;

	}
	div.appendChild(timestamp);
	div.title ="Phase " + status.status.phase + "/" + status.status.total_phases;
	return div;
}


function getFailedStatusDiv(status) {
	var div = document.createElement("div");
	div.appendChild(document.createTextNode(status.status.description));
	div.appendChild(document.createElement("br"));
	
	var date_state_hr = "";
	try {
		date_state_hr = getHumanReadableDate(new Date(status.status.time));
	}
	catch (err) {
		date_state_hr = "n/a";
	}
	var timestamp = document.createElement("div");
	timestamp.className = "timestamp";
	timestamp.innerHTML = date_state_hr;
	
	div.appendChild(timestamp);
	
	return div;
}

function getLastRenderingFinishedTime(status) {
	var last_rendering_finished = 0;
	if (status != null) {
		var max_id = -1;
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
	return last_rendering_finished;
}



/*-----------------------------------------*/
/* for index.html                          */
/*-----------------------------------------*/

function refreshCityTable(cities_status) {
	this.cached_cities_status = cities_status;
  	//clear table
 	var table = document.getElementById("city_list").getElementsByTagName("tbody")[0];
	while (table.firstElementChild) {
 		table.removeChild(table.firstElementChild);
	}
 	
	var city = null;
	for (var i = 0; i<this.cities.length; i++) {
		city = this.cities[i];
		 var row = document.createElement("tr");
		//Thumbnail
		 var cell0 = document.createElement("td");
		 var link = document.createElement("a");
		 link.setAttribute("href", "map.html#" + city.city_id);
		 var image = document.createElement("img");
		 image.setAttribute("src", "tiles/14/" + Math.round(long2tile((city.area.left + city.area.right)/2.0,14)) + "/" + Math.round(lat2tile((city.area.top + city.area.bottom)/2.0,14)/2.0) + ".png");
		 image.setAttribute("class", "thumbnail");
		 link.appendChild(image);
		 cell0.appendChild(link);
		
		//Name and link
		 var cell1 = document.createElement("td");
		 var link1 = document.createElement("a");
		 link1.setAttribute("href", "map.html#" + city.city_id);
		 link1.innerHTML = city.name;
		 cell1.appendChild(link1);
		
		//Last update
		var status = getStatusByCityId(cities_status, city.city_id);
		var last_rendering_finished = getLastRenderingFinishedTime(status);

		 var cell2 = document.createElement("td");
		 if (last_rendering_finished == 0) {
		 	cell2.innerHTML = "n/a";
		 }
		 else {
			var date = new Date(last_rendering_finished);
			cell2.innerHTML = getHumanReadableDate(date);
		 }
		
		//Status
		 var cell3 = document.createElement("td");
		if (status != null) {
			if (status.status.type == "READY") {
				cell3.innerHTML = "";
			}
			else {
				if (status.status.type =="WORKING") {
					working=true;
					cell3.appendChild(getWorkingStatusDiv(status));
				}
				else {
					cell3.appendChild(getFailedStatusDiv(status));
				}
			}
		}

		 row.appendChild(cell0);
		 row.appendChild(cell1);
		 row.appendChild(cell2);
		 row.appendChild(cell3);
		 table.appendChild(row);
	}
}
 
function initIndex() {
	mode = Modes.INDEX;
	
	var table = document.getElementById("city_list").getElementsByTagName("tbody")[0];
	table.innerHTML = '<tr><td><img src="img/loading.gif"/> Loading...</td><td></td><td></td></tr>';

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

function showStats() {
	var status = getStatusByCityId(this.cached_cities_status, current_city.city_id);
	var message = "";
	message += "<ul>"
	message += "<li>Number of tiles (zoom=12): " + status.stats.tiles + "</li>";
	message += "<li>Number of tiles (total): " + status.stats.total_tiles + "</li>";
	message += "<li>Average phase durations: ";
	var sumDurations = 0;
	for (var i = 1; i <= 5; i++) {
		sumDurations += getAveragePhaseDuration(status, i);
		message += parseInt(getAveragePhaseDuration(status, i)/1000) + "s ";
	}
	message += "</li>";
	message += "<li>Average update duration: " + parseInt(sumDurations/1000/60) + "min";
	message += "<li>Last rendering finished: " + (new Date(getLastRenderingFinishedTime(status))).toUTCString() + "</li>";
	message += "</ul>";
	message += '<a href="javascript:hideMessage()">Close</a>';
	showMessage("Statistics for " + current_city.name, message);
}

function refreshState(cities_status) {
	this.cached_cities_status = cities_status;
	var stateDiv = document.getElementById("state");
	stateDiv.innerHTML = '<div class="timestamp">' + "Last update: unkown" + "</div>";
	
	var status = getStatusByCityId(cities_status, current_city.city_id);
	if (status != null) {
		var last_rendering_finished = getLastRenderingFinishedTime(status);
		
		if (status.status.type == "WORKING") {
			this.working=true;
			stateDiv.innerHTML = "";
			stateDiv.appendChild(getWorkingStatusDiv(status));
		}
		else {
			this.working = false;
			if (last_rendering_finished == 0) {
				stateDiv.innerHTML = '<div class="timestamp">' + "Last update: n/a" + "</div>";
			}
			else {
				var lastUpdateStr = "Last update: " + getHumanReadableDate(new Date(last_rendering_finished));
				stateDiv.innerHTML = '<div class="timestamp">' + lastUpdateStr + "</div>";
			}
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
				 if (select.options[i].value == city.city_id) {
					 select.options[i].selected = true;
				 }
				 else {
					 select.options[i].selected = false;
				 }
			 }
			 loadStatus(false);
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
	loadStatus(true);
}
