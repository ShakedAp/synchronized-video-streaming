const fs = require("fs");
const express = require('express');
const bodyParser = require('body-parser');
const session = require("express-session");
const WebSocket = require('ws');
const app = express();
const server = require('http').createServer(app);

// creating the server web socket
const wss = new WebSocket.Server({
	server: server
});
// importing settings from settings.json
const settings = JSON.parse(fs.readFileSync("settings.json"));

// server variables and video state
const THRESH_IGNORANCE = 250;
let users_amount = 0;
let unique_id = 0;
let state = {
	video_timestamp: 0,
	last_updated: get_time(),
	playing: false,
	global_timestamp: 0,
	client_uid: null
};

wss.on('connection', function connection(ws) {
	// on connection from client send update
	users_amount += 1;
	console.log('A new client Connected. Amount of users: ', users_amount);
	state.client_uid = unique_id;
	unique_id += 1;
	ws.send(`state_update_from_server ${JSON.stringify(state)}`);

	// log web socket error
	ws.on('error', console.error);

	ws.on('message', function message(data) {
		data = data.toString();

		// syncing requests from the client
		if (data.startsWith("time_sync_request_backward")) {
			ws.send(`time_sync_response_backward ${get_time()}`);
		}
		if (data.startsWith("time_sync_request_forward")) {
			let client_time = Number(data.slice("time_sync_request_forward".length + 1));
			ws.send(`time_sync_response_forward ${get_time() - client_time}`);
		}
		// video state update from client. Update state and broadcast to all users
		if (data.startsWith("state_update_from_client")) {
			let new_state = JSON.parse(data.slice("state_update_from_client".length + 1));
			let too_soon = (get_time() - state.last_updated) < THRESH_IGNORANCE;
			let other_ip = (new_state.client_uid != state.client_uid);
			let stale = (new_state.last_updated < state.last_updated)

			// checking if we should update, in order not to update too much
			if (!stale && !(too_soon && other_ip)) {
				state = new_state;
				
				// broadcasting to all other clients the new state
				wss.clients.forEach(function each(client) {
					if (client !== ws && client.readyState === WebSocket.OPEN) {
						client.send(`state_update_from_server ${JSON.stringify(state)}`);
					}
				});
			}
		}
	});

	// client disconnect
	ws.on('close', function close() {
		users_amount -= 1;
		console.log('Client diconnected. Amount of users: ', users_amount);
	});

});


////  Web server  ////

// app settings
app.use('/', express.static(__dirname));
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(bodyParser.json());
app.use(session({
	secret: 'secret key',
	resave: false,
	saveUninitialized: false,
	logged: false
}));


// home page
app.get("/", function (req, res) {
	if (req.session.logged)
		res.sendFile(__dirname + "/main.html");
	else
		res.sendFile(__dirname + "/login.html");
});


// receive login info
app.post("/login", function (req, res) {
	const data = req.body;
	if (!data)
		res.sendStatus(400);
	else
	{
		if (data.password == settings.password)
			req.session.logged = true;
		else
			req.session.logged = false;
	
		res.redirect("/");
	}

});


// video streaming
app.get("/video", function (req, res) {
	// Ensure there is a range given for the video
	const range = req.headers.range;
	if (!range) {
		res.status(400).send("Requires Range header");
	}

	// get video stats (about 61MB)
	const videoPath = settings.video_path;
	const videoSize = fs.statSync(videoPath).size;

	// parse Range
	// Example: "bytes=32324-"
	const CHUNK_SIZE = 10 ** 6; // 1MB
	const start = Number(range.replace(/\D/g, ""));
	const end = Math.min(start + CHUNK_SIZE, videoSize - 1);

	// create headers
	const contentLength = end - start + 1;
	const headers = {
		"Content-Range": `bytes ${start}-${end}/${videoSize}`,
		"Accept-Ranges": "bytes",
		"Content-Length": contentLength,
		"Content-Type": "video/mp4",
	};

	// HTTP Status 206 for Partial Content
	res.writeHead(206, headers);

	// create video read stream for this particular chunk
	const videoStream = fs.createReadStream(videoPath, {
		start,
		end
	});

	// stream the video chunk to the client
	videoStream.pipe(res);
});


// host server on given ip and port
server.listen(settings.server_port, settings.server_ip,
	() => console.log(`Server started at ${settings.server_ip}:${settings.server_port}`));


// function to get the current time
function get_time() {
	let d = new Date();
	return d.getTime();
}