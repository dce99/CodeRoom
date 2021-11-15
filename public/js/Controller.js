// const uuid = require("uuid");
const Peer = require("./Peer");
const VersionClock = require("./VersionClock");
const Char = require("./Char");
const Version = require("./Version");
const CRDT = require("./Crdt");
const socket = io();

class Controller {

    constructor(editor, roomId) {
        this.siteId = uuid.v4();
        this.network = []; // all peerIds in the network

        this.peer = new Peer(this.siteId);
        this.peer.controller = this;
        this.peerId = uuid.v4();

        this.clock = new VersionClock(this.siteId);
        this.buffer = [];
        this.crdt = new CRDT(this);

        this.editor = editor;
        this.editor.controller = this;
        this.editor.bindChangeEvents();

        this.roomId = roomId;

        // this.host = hostPeerId;
        // this.sendConnectionRequest(host);
    };

    initServer() {
        socket.emit("joinRoom", this.peerId, this.roomId);
        socket.on("joinedRoom", (ids) => {
            for (let id of ids) {
                if (id !== this.peerId && this.network.find(pid => pid == id) == undefined) this.network.push(id);
            }
            this.sendConnectionRequest();
        });

        socket.on("newConnection", (id) => {
            if (this.id !== this.peerId && this.network.find(pid => pid == id) == undefined) this.network.push(id);
        });

        /* signalling starts here */
        socket.on("message", async (id, msg, type) => {
            // console.log("receiving offer from", id);
            const message = {
                type: type,
                peerId: id,
                msg: msg,
            };
            this.peer.receiveMesage(message);
        });


        socket.on("disconnected", peerId => {
            this.removeConnection(peerId);
        })

        /* signalling ends here */
    }


    // sendConnectionRequest(peerId) { // this is when a user clicks on the CodeRoom Link, so send a webSocket message to the captain of the CodeRoom
    //     if (this.peerId !== peerId)
    //         socket.emit("message", peerId, this.peerId, null, "acceptOrForwardRequest");
    // }

    sendConnectionRequest() {
        for (let peerId of this.network) {
            if (peerId !== this.peerId) {
                socket.emit("message", peerId, this.peerId, null, "acceptOrForwardRequest");
            }
        }
    }

    emitOffer(peerId, offer) {
        this.addToNetwork(peerId);
        socket.emit("message", peerId, this.peerId, offer, "offer");
    }

    emitCandidate(peerId, candidate) {
        socket.emit('message', peerId, this.peerId, candidate, "candidate");
    }

    emitAnswer(peerId, answer) {
        this.addToNetwork(peerId);
        socket.emit("message", peerId, this.peerId, answer, "answer");
    }

    emitRequestAccepted(peerId, msg) {
        socket.emit("message", peerId, this.peerId, msg, "requestAccepted");
    }

    addToNetwork(peerId) {
        if (this.network.find(pid => pid == peerId) == undefined) this.network.push(peerId);
    }

    removeConnection(peerId) {
        this.network = this.network.filter(pid => pid !== peerId);
        const message = {
            type: "removeConnection",
            peerId: peerId,
        }
        this.peer.receiveMesage(message);
    }

    remoteOperations(message) {
        const operation = message.operation;
        if (this.clock.alreadyCommited(operation.version)) return;

        if (message.type == "insert") {
            this.applyOperations(operation, message.type);
        }
        else {
            this.buffer.push(operation);
        }

        this.processBuffer();
        this.peer.sendMessage(JSON.stringify(message));
    }


    processBuffer() {
        for (let i = 0; i < this.buffer.length; i++) {
            if (this.insertPerformed(this.buffer[i])) {
                this.applyOperations(this.buffer[i]);
                this.buffer.splice(i, 1);
                i--;
            }
        }
    }

    insertPerformed(operation) {
        const version = { siteId: operation.char.siteId, counter: operation.char.counter };
        return this.clock.alreadyCommited(version);
    }


    applyOperations(operation, type) {
        const char = operation.char;
        const position = char.position.map(id => id);
        const newChar = new Char(char.siteId, position, char.value, char.counter);

        if (type === "insert") {
            this.crdt.remoteInsert(newChar);
        }
        else {
            this.crdt.remoteDelete(newChar, operation.version.siteId);
        }

        this.clock.update(operation.version);
    }


    localDelete(startPos, endPos) {
        this.crdt.localDelete(startPos, endPos);
    }

    localInsert(chars, startPos) {
        for (let i = 0; i < chars.length; i++) {
            if (chars[i] == "\n") {
                // console.log(startPos.line, startPos.ch);
                this.crdt.localInsert(chars[i], startPos);
                startPos.line++;
                startPos.ch = 0;
            }
            else {
                // console.log(startPos.line, startPos.ch);
                this.crdt.localInsert(chars[i], startPos);
                startPos.ch++;
            }
        }
    }


    broadcastInsert(char) {
        const operation = {
            char: char,
            version: this.clock.makeLocalVersion(),
        }

        const message = {
            "type": "insert",
            "operation": operation,
        }
        this.peer.sendMessage(JSON.stringify(message));
    }

    broadcastDelete(char) {
        const operation = {
            char: char,
            version: this.clock.makeLocalVersion(),
        }

        const message = {
            type: "delete",
            operation: operation,
        }
        this.peer.sendMessage(JSON.stringify(message));
    }


    broadcastCursor(cursor) {
        const message = {
            type: "setCursor",
            cursor: cursor,
        }
        this.peer.sendMessage(JSON.stringify(message));
    }

    broadcastSelection(range) {
        const message = {
            type: "setSelection",
            range: range,
        }
        this.peer.sendMessage(JSON.stringify(message));
    }

    setCursor(cursor) {
        this.editor.setCursor(cursor);
    }

    setSelection(range) {
        this.editor.setSelection(range);
    }

    insertInEditor(value, pos, siteId) {
        const positions = {
            from: {
                line: pos.line,
                ch: pos.ch,
            },

            to: {
                line: pos.line,
                ch: pos.ch,
            }
        };

        this.editor.insertChar(value, positions, siteId);
    }

    deleteInEditor(value, pos, siteId) {

        let positions = {};
        if (value == "\n") {
            positions = {
                from: {
                    line: pos.line,
                    ch: pos.ch,
                },
                to: {
                    line: pos.line + 1,
                    ch: 0,
                }
            }
        }
        else {
            positions = {
                from: {
                    line: pos.line,
                    ch: pos.ch,
                },
                to: {
                    line: pos.line,
                    ch: pos.ch + 1,
                }
            }
        }

        this.editor.deleteChar(value, positions, siteId);
    }

    syncData(obj) {
        obj.network.forEach(peerId => this.network.push(peerId));
        const crdt = {
            data: obj.data,
            choiceHistory: obj.choiceHistory,
        }
        this.populateCRDT(crdt);
        this.populateVersionClock(obj.clock);
    }


    populateCRDT(crdt) {
        if (crdt.data) {
            const data = crdt.data.map(line => {
                const newLine = line.map(char => {
                    const newChar = new Char(char.siteId, char.position, char.value, char.counter);
                    return newChar;
                });
                return newLine;
            });
            this.crdt.data = data;
        }

        if (crdt.choice)
            this.crdt.choiceHistory = crdt.choiceHistory.map(choice => choice);
        const text = this.crdt.toText();
        console.log(text);
        this.editor.replaceText(text);
    }

    populateVersionClock(peerClock) {
        if (peerClock.versions) {
            const versions = peerClock.versions.map(version => {
                const newVersion = new Version(version.siteId);
                newVersion.counter = version.counter;
                newVersion.history = version.history.map(counter => counter);
                return newVersion;
            });
            versions.forEach(version => this.clock.versions.push(version));
        }
    }


}


module.exports = Controller;

