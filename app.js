if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const mongoose = require("mongoose");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const cookieParser = require("cookie-parser");
const path = require("path");
const app = express();
const server = require("http").createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
// const Dockerode = require("dockerode");
// const docker = new Dockerode();

const PORT = process.env.PORT || 3000;
const dbURI = process.env.DB_URI || "mongodb://localhost:27017/intro-db";
mongoose.connect(
  dbURI,
  { useNewUrlParser: true, useUnifiedTopology: true },
  (err) => {
    if (err) {
      console.log(err);
    } else {
      server.listen(PORT, (err) => {
        if (err) {
          console.log(err);
        } else {
          console.log(`Server is running on ${PORT} and connected to mongoDB`);
        }
      });
    }
  }
);

/* configuration */

app.set("view engine", "ejs");
app.engine("ejs", ejsMate);
app.set("views", path.join(__dirname, "views"));


app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

// let ver;
// docker.version().then(x => {
//   console.log(x); ver = x;
// }
// )

app.get("/", async (req, res) => {
  try {
    // res.status(200).send({ msg: ver });
    res.render("home");
  }
  catch (err) {
    console.log(err);
  }
});


app.get("/room/:id", (req, res) => {
  const { id } = req.params;
  try {
    res.render("room", { roomId: id });
  }
  catch (err) {
    console.log("Error creating room : ", err);
  }
})

const hashId = {};
const rooms = {}; // roomdId : [] // array of peerIds in the roomId

io.on("connect", async (socket) => {
  // console.log("new Connection : ", socket.id);
  const socketId = socket.id;
  let socketPeerId;
  let socketRoomId;
  socket.join("Coderoom");
  socket.on("message", (peerId, myPeerId, msg, type) => {
    const toId = hashId[peerId];
    if (toId !== undefined)
      socket.to(toId).emit("message", myPeerId, msg, type);
  });

  socket.on("joinRoom", (peerId, roomId) => {
    hashId[peerId] = socketId;
    socketPeerId = peerId;
    socketRoomId = roomId;

    socket.join(roomId);
    if (rooms[roomId] === undefined) rooms[roomId] = [];
    rooms[roomId].push(peerId);
    console.log(rooms[roomId]);

    // const sids = io.sockets.adapter.rooms.get(roomId);
    const ids = [];
    for (let pid of rooms[roomId]) {
      ids.push(pid);
    }
    console.log(ids);
    socket.emit("joinedRoom", ids);

    socket.to(roomId).emit("newConnection", peerId);
  });

  socket.on("disconnected", () => {
    console.log("disconnected : ", id);
    hashId[socketPeerId] = undefined;
    rooms[socketRoomId] = rooms[socketRoomId].filter(pid => pid !== socketPeerId);
    socket.emit("disconnected", socketPeerId);
  });

})




