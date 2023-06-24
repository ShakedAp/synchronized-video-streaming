const express = require('express')
const app = express()
const server = require('http').createServer(app);
const WebSocket = require('ws')

const wss = new WebSocket.Server({ server:server });

wss.on('connection', function connection(ws) {
  console.log('A new client Connected!');
  ws.send('Welcome New Client!');
});

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});

server.listen(3000, () => console.log(`Lisening on port :3000`))