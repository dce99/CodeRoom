
const config = {
    'iceServers': [{ 'urls': 'stun:stun.1.google.com:19302' },
    {
        url: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
    }]
};

class Peer {

    constructor(siteId) {
        this.siteId = siteId;
        this.outConn = []; // outgoing peer connections
        this.inConn = []; // incoming peer connections
        this.dc = []; // dataChannels of the peer connections
        this.controller = null;
    }

    receiveMesage(message) {

        switch (message.type) {
            case "removeConnection":  // a peer got disconnect from internet, so reomve from outCon, dc, inCon, network
                this.removeConnection(message);
                break;
            case "syncData": // initialize
                this.controller.syncData(message.obj);
                break;
            case "requestAccepted": // create offer
                this.sendRequest(message.peerId);
                break;
            case "acceptOrForwardRequest": // check whether limit has reached or accept request and signal to sender to send offer
                this.acceptOrForward(message);
                break;
            case "sendInitialData":
                this.sendInitialData(message.peerId);
                break;
            case "offer":
                this.acceptOffer(message.peerId, message.msg);
                break;
            case "answer":
                this.acceptAnswer(message.peerId, message.msg);
                break;
            case "candidate":
                this.addIceCandidate(message.peerId, message.msg);
                break;
            case "insert":   // insert ,delete
                this.controller.remoteOperations(message);
                break;
            case "delete":
                this.controller.remoteOperations(message);
                break;
            case "setCursor":
                this.controller.setCursor(message.cursor);
                break;
            case "setSelection":
                this.controller.setSelection(message.range);
                break;
            default:
                console.log("message unknwon : ", message.type);
        }
    }


    getOutConnection(peerId) {
        if (this.outConn[peerId] == undefined) {
            this.outConn[peerId] = new RTCPeerConnection(config);
            const peerCon = this.outConn[peerId];

            peerCon.onicecandidate = e => {
                this.controller.emitCandidate(peerId, e.candidate);
            }

            this.dc[peerId] = peerCon.createDataChannel("send data channel");
            const dataChannel = this.dc[peerId];
            dataChannel.onopen = (e) => console.log("Connection opened with : ", peerId);
            dataChannel.addEventListener("message", (event) => {
                this.receiveMesage(JSON.parse(event.data));
            });

        }

        return this.outConn[peerId];
    }

    getInConnection(peerId) {
        if (this.inConn[peerId] == undefined) {
            this.inConn[peerId] = new RTCPeerConnection(config);
            this.inConn[peerId].onicecandidate = e => {
                // console.log("sending ice ");
                this.controller.emitCandidate(peerId, e.candidate);
            }

            this.inConn[peerId].ondatachannel = (event) => {
                const dch = event.channel;
                console.log(dch);
                this.dc[peerId] = dch;
                dch.onopen = (e) => console.log("Connection opened with : ", peerId);
                dch.onmessage = (e) => {
                    this.receiveMesage(JSON.parse(e.data));
                }
            };
        }
        return this.inConn[peerId];
    }

    getDataChannel(peerId) {
        console.log(this.outConn);
        if (this.outConn[peerId] !== undefined) {
            return this.dc[peerId];
        }
        else return null;
    }

    async sendRequest(peerId) {
        const peerCon = this.getOutConnection(peerId);
        const offer = await peerCon.createOffer();
        await peerCon.setLocalDescription(offer);
        this.controller.emitOffer(peerId, offer);
    }

    addIceCandidate(peerId, msg) {
        if (msg && msg.sdpMid !== null) {
            let peerCon = this.getOutConnection(peerId);
            if (peerCon) {
                // console.log("alea");
                peerCon.addIceCandidate(new RTCIceCandidate(msg))
                    // .then(() =>)// console.log("ice candidtae ", msg, " added successfully"))
                    .catch(e => console.log(e));
            }

            peerCon = this.getInConnection(peerId);
            if (peerCon) {
                // console.log("blea");
                peerCon.addIceCandidate(new RTCIceCandidate(msg))
                    //.then(() => )//console.log("ice candidtae ", msg, " added successfully"))
                    .catch(e => console.log(e));
            }
        }
    }

    addToOutConn(peerCon) {
        this.outConn.push(peerCon);
    }

    async acceptOffer(peerId, msg) {
        const peerCon = this.getInConnection(peerId);
        this.addToOutConn(peerCon);
        await peerCon.setRemoteDescription(new RTCSessionDescription(msg));
        const answer = await peerCon.createAnswer();
        await peerCon.setLocalDescription(answer);
        this.controller.emitAnswer(peerId, answer);
    }

    async acceptAnswer(peerId, msg) {
        const peerCon = this.getOutConnection(peerId);
        const sd = new RTCSessionDescription(msg);
        await peerCon.setRemoteDescription(sd);
        // add logic for passing control to controller and building crdt and version vector and sending it to peerId
        this.dc[peerId].onopen = (e)=>{
            console.log("Sent request for initial data");
            const message = {
                type: "sendInitialData",
                peerId: this.controller.peerId,
            }
            this.dc[peerId].send(JSON.stringify(message)); // ...
        };
    }

    sendMessage(message) {
        // this.controller.network.forEach(peerId=>{
        //     this.dc[peerId] = this.outConn[peerId].createDataChannel("send channel");
        // });

        // console.log(this.dc.length);
        Object.entries(this.dc).forEach((arr) => {
            const dch = arr[1];
            if (dch.readyState === "open") {
                dch.send(message);
            }
        })
    }

    acceptOrForward(message) {
        let limit = Math.ceil(Math.log2(this.controller.network.length));
        limit = Math.max(limit, 5);
        if (this.outConn.length >= limit) {
            this.forwardRequest(message);
        }
        else this.acceptRequest(message);
    }

    acceptRequest(message) {
        const peerId = message.peerId;
        const msg = {
            peerId: this.controller.peerId, // ...
            status: "accepted",
        };
        this.controller.emitRequestAccepted(peerId, msg);
    }


    forwardRequest(message) {
        this.sendMessage(message);
    }

    sendInitialData(peerId) {
        console.log("Sending initial data");
        const message = {
            type: "syncData",
            obj: {
                peerId: this.controller.peerId,
                data: this.controller.crdt.data,
                choiceHistory : this.controller.crdt.choiceHistory,
                clock: this.controller.clock,
                siteId: this.controller.siteId,
                network: this.controller.network,
            }
        }
        this.dc[peerId].send(JSON.stringify(message)); // ...
    }

    removeConnection(peerId) {
        delete this.outConn[peerId];
        delete this.inConn[peerId];
        delete this.dc[peerId];
    }
}


// module.exports = Peer;