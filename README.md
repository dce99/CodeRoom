# CodeRoom
A Real Time Collaborative Code Editor based on Peer to Peer architecture.
Create a room , share the RoomID , join with the link and
code together and see live changes being reflected.

Using a signalling server, we can initiate the connection from one client to another.
Every client maintains a list of clients which are active or are connected.
When a client joins a room , that client is connected to a random client. If that random client has reached the upper limit of connections (logarithmic of the total number of active connections) then the new client tries to connect to other clients in the network.

The central server is only used for initial connection phase and once a client is connected to another client , the central server is no longer required for communication,  which means this avoids a <strong>single source of failure</strong>. 

<strong>Central server is created using WebSockets and the clients communicate to each other using WebRTC's data channels</strong>
