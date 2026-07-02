const express = require('express')
const app = express()
const path = require('path');
const socketio = require('socket.io');
const http = require('http');
const port = 3000

const server = http.createServer(app);

const io = socketio(server);

io.on("connection", function(socket){
    socket.on("send-location", function(data){
        io.emit("receive-location", {id: socket.id, ...data});
    })
    socket.on("disconnect", function(){
        io.emit("user-disconnected", socket.id);
    })
    console.log("Connected"); 
})

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get('/', (req, res) => res.render('index'))
server.listen(port, () => console.log(`Example app listening on port ${port}!`))