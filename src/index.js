// https://www.npmjs.com/package/ws#api-docs
// https://developer.mozilla.org/en-US/docs/Web/API/WebSocket

const fs = require("fs");
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const WebSocket = require('ws');

const wss = new WebSocket.Server({ server:server });
const settings = JSON.parse(fs.readFileSync("settings.json"));

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
    users_amount += 1;
    console.log('A new client Connected. Amount of users: ', users_amount);
    state.client_uid = unique_id;
    unique_id +=1 ;
    ws.send(`state_update_from_server ${JSON.stringify(state)}`);

    ws.on('error', console.error);

    ws.on('message', function message(data) {
        data = data.toString();

        if(data.startsWith("time_sync_request_backward"))
        {
            ws.send(`time_sync_response_backward ${get_time()}`);
        }
        if(data.startsWith("time_sync_request_forward"))
        {
            let client_time = Number(data.slice("time_sync_request_forward".length + 1));
            ws.send(`time_sync_response_forward ${get_time() - client_time}`);
        }
        if(data.startsWith("state_update_from_client"))
        {
            let new_state = JSON.parse(data.slice("state_update_from_client".length + 1));
            let too_soon = (get_time() - state.last_updated) < THRESH_IGNORANCE;
            let other_ip = (new_state.client_uid != state.client_uid);
            let stale = (new_state.last_updated < state.last_updated)
            
            if (!stale && !(too_soon && other_ip))
            {
                state = new_state;
                
                wss.clients.forEach(function each(client) {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                      client.send(`state_update_from_server ${JSON.stringify(state)}`);
                    }
                });
            }
        }
    });
    
    ws.on('close', function close() {
        users_amount -= 1;
        console.log('Client diconnected. Amount of users: ', users_amount);
    });

});


app.use(express.static(__dirname));
app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});


app.get("/video", function (req, res) {
    // Ensure there is a range given for the video
    const range = req.headers.range;
    if (!range) {
      res.status(400).send("Requires Range header");
    }
  
    // get video stats (about 61MB)
    const videoPath = settings.video_path;
    const videoSize = fs.statSync(videoPath).size;
  
    // Parse Range
    // Example: "bytes=32324-"
    const CHUNK_SIZE = 10 ** 6; // 1MB
    const start = Number(range.replace(/\D/g, ""));
    const end = Math.min(start + CHUNK_SIZE, videoSize - 1);
  
    // Create headers
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
    const videoStream = fs.createReadStream(videoPath, { start, end });
  
    // Stream the video chunk to the client
    videoStream.pipe(res);
});

server.listen(settings.server_port, settings.server_ip, () => console.log(`Listening on port: 3000`));


function get_time(){
	let d = new Date();
	return d.getTime();
}