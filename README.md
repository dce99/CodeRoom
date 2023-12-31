# CodeRoom
A Real Time Collaborative Code Editor based on Peer to Peer architecture.
Create a room , share the RoomID , join with the RoomID, code together and see live changes being reflected.

Using a signalling server, we can initiate the connection from one client to another.
Every client maintains a list of clients which are active or are connected.
When a client joins a room , that client is connected to a peer. If that peer has reached the upper bound of connections (logarithmic of the total number of active connections) then the new client tries to connect to other clients in the network.

The central server is only used for initial connection phase and once a client is connected to another client , the central server is no longer required for communication,  which means this <strong> avoids a single source of failure</strong>. 

<strong>Central server is created using WebSockets and the clients communicate to each other using WebRTC's data channels</strong>

<strong><i>Read the 'CodeRoom Report' pdf for insights to algorithms used and implementation.</i></strong>
  
<h3>Snapshots</h3>

- Home Page
[![ss1.png](https://i.postimg.cc/XYwLw5Bt/ss1.png)](https://postimg.cc/yD80KkPT)

- Technical Details
  <img width="1401" alt="Screenshot 2023-12-29 at 6 27 36 PM" src="https://github.com/dce99/CodeRoom/assets/94372740/f68ac53e-f9c3-4c95-890a-6af3d57a1329">


- Code Editor Demo
[![ss2.png](https://i.postimg.cc/wMC5Nxq6/ss2.png)](https://postimg.cc/YLxmKHLV)
