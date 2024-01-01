(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
const Identifier = require("./Identifier");

class Char{
    constructor(siteId ,position, value, counter){
        this.position = position;
        this.siteId = siteId;
        this.value = value;
        this.counter = counter;
    }



    compareChar(ch){
        const pos1 = this.position;
        const pos2 = ch.position;

        for(let i = 0;i < Math.min(pos1.length, pos2.length); i++){
            const id1 = pos1[i];
            const id2 = pos2[i];
            const temp = new Identifier(id1.digit, id1.siteId);
            const res = temp.compareIdentifier(id2);
            if(res !== 0) return res;
        }

        if(pos1.length < pos2.length) return -1;
        else if(pos1.length > pos2.length) return 1;
        else return 0;
    }
}

module.exports = Char;


},{"./Identifier":5}],2:[function(require,module,exports){
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


},{"./Char":1,"./Crdt":3,"./Peer":6,"./Version":7,"./VersionClock":8}],3:[function(require,module,exports){
const Identifier = require("./Identifier");
const Char = require("./Char");

class CRDT {

    constructor(controller) {
        this.siteId = controller.siteId;
        this.controller = controller;
        this.base = 32;
        this.boundary = 10;
        this.choice = "random";
        this.clock = controller.clock;
        this.data = [[]];
        this.choiceHistory = [];
    }

    generateChar(value, pos) {
        const posBefore = this.getPosBefore(JSON.parse(JSON.stringify(pos)));
        // console.log(posBefore, pos);
        // console.log("pos after posBefore : ", pos);
        const posAfter = this.getPosAfter(pos);
        // console.log("PoaAfter : ",posAfter, pos );
        const newPos = this.generateLSEQPosBetween(posBefore.position, posAfter.position);

        const char = new Char(this.siteId, newPos, value, this.clock.localVersion.counter);
        return char;
    }

    localInsert(value, pos) {
        // pos is line number and character number in 2d array
        const char = this.generateChar(value, pos);
        // console.log(char);
        this.insertChar(char, pos);
        this.clock.increment(); // increments the local counter
        this.controller.broadcastInsert(char);
    }

    remoteInsert(char) {
        const pos = this.findPosition(char);
        this.insertChar(char, pos);
        this.controller.insertInEditor(char.value, pos, char.siteId);  //complete in controller class only
    }

    getPosBefore(pos) {
        if (pos.ch == 0 && pos.line == 0) {
            return [];
        }
        else if (pos.ch == 0) {
            pos.line = pos.line - 1;
            pos.ch = this.data[pos.line].length;
        }

        return this.data[pos.line][pos.ch - 1];
    }

    getPosAfter(pos) {
        // console.log("after not empty", pos.line, this.data.length - 1, pos.ch, this.data[pos.line].length);
        if ((pos.line === this.data.length - 1) && (pos.ch === this.data[pos.line].length)) {
            // console.log("inside");
            return [];
        }
        else if (pos.line > this.data.length - 1 && pos.ch == 0) {
            return [];
        }
        else if (pos.ch == this.data[pos.line].length) {
            pos.ch = 0;
            pos.line = pos.line + 1;
        }

        return this.data[pos.line][pos.ch];
    }


    generateLSEQPosBetween(pos1, pos2, newPos = [], level = 0) {

        const base = this.base * Math.pow(2, level);
        const id1 = (pos1 && pos1.length > 0) ? pos1[0] : new Identifier(0, this.siteId);
        const id2 = (pos2 && pos2.length > 0) ? pos2[0] : new Identifier(base, this.siteId);

        if (id2.digit - id1.digit > 1) {
            // console.log("before digit ", id1.digit);
            const id = this.generateIdBetween(id1.digit, id2.digit, this.siteId, level);
            newPos.push(id);
            return newPos;
        }
        else if (id2.digit - id1.digit == 1) {
            newPos.push(id1);
            return this.generateLSEQPosBetween(pos1.slice(1), [], newPos, level + 1);
        }
        else {

            if (id1.siteId < id2.siteId) {
                newPos.push(id1);
                return this.generateLSEQPosBetween(pos1.slice(1), [], newPos, level + 1);
            }
            else if (id1.siteId == id2.siteId) {
                newPos.push(id1);
                return this.generateLSEQPosBetween(pos1.slice(1), pos2.slice(1), newPos, level + 1);
            }
        }
    }


    generateIdBetween(dig1, dig2, siteId, level) {
        const digit = this.generateDigit(dig1, dig2);
        const id = new Identifier(digit, siteId);
        return id;
    }

    generateDigit(dig1, dig2, level) {
        let choice = this.choiceHistory[level];
        if (choice == undefined) {
            const s = Math.floor(Math.random() * 2);
            choice = (s == 0) ? "left" : "right";
            this.choiceHistory[level] = choice;
        }
        let digit;
        // console.log(dig1, dig2);
        if (choice == "left") {
            // console.log("choice: Left");
            const mn = dig1 + 1;
            const mx = Math.min(dig2 - 1, Math.ceil(Math.random() * this.boundary) + dig1);
            digit = Math.floor(Math.random() * (mx - mn + 1)) + mn;
        }
        else {
            const mx = dig2 - 1;
            const mn = Math.max(dig1 + 1, dig2 - Math.ceil(Math.random() * this.boundary));
            digit = Math.floor(Math.random() * (mx - mn + 1)) + mn;
        }

        return digit;
    }


    insertChar(char, pos) {

        if (pos.line == this.data.length) this.data.push([]);

        if (char.value == "\n") {
            const newLine = this.data[pos.line].splice(pos.ch);
            this.data[pos.line].push(char);
            this.data.splice(pos.line + 1, 0, newLine);
        }
        else {
            // console.log(this.data.length, pos.line, pos.ch);
            this.data[pos.line].splice(pos.ch, 0, char);
        }
    }

    isEmpty(data) {
        if (data.length == 1 && data[0].length == 0) return true;
        else return false;
    }

    findPosition(char) {
        if (this.isEmpty(this.data) || char.compareChar(this.data[0][0]) < 0) {
            // console.log("yolo");
            return { line: 0, ch: 0 };
        }

        const line = this.binarySearchData(char)
        let ch;
        if (line < this.data.length && line >= 0) {
            ch = this.binarySearchLine(char, line);
            if (ch == -1) ch = 0;
        }
        else ch = 0;
        const pos = {
            line, ch,
        };
        return pos;
    }


    binarySearchData(char) {
        let l = 0;
        let h = this.data.length - 1;
        let line = -1;
        while (l < h) {
            let mid = Math.floor(l + (h - l) / 2);
            // console.log(this.data[mid][this.data[mid].length - 1]);
            const res = char.compareChar(this.data[mid][this.data[mid].length - 1]);
            if (res <= 0) {
                h = mid;
            }
            else {
                l = mid + 1;
            }
        }

        line = h;
        return line;
    }


    binarySearchLine(char, line) {
        let l = 0, h = this.data[line].length - 1;
        // console.log("line from bsData: ", line, h);
        let ch = -1;
        while (l <= h) {
            let mid = Math.floor(l + (h - l) / 2);
            // console.log("hello", mid, this.data[line][mid]);
            const res = char.compareChar(this.data[line][mid]);
            if (res <= 0) {
                h = mid - 1;
            }
            else {
                l = mid + 1;
            }
        }
        ch = l;

        return ch;
    }

    localDelete(startPos, endPos) {
        let chars;
        let newLineRemoved = false;
        if (startPos.line < endPos.line) {
            newLineRemoved = true;
            chars = this.data[startPos.line].splice(startPos.ch);
            for (let line = startPos.line + 1; line < endPos.line; line++) {
                chars = chars.concat(this.data[line].splice(0));
            }
            if (this.data[endPos.line]) {
                const temp = this.data[endPos.line].splice(0, endPos.ch);
                chars = chars.concat(temp);
            }
        }
        else {
            chars = this.data[startPos.line].splice(startPos.ch, endPos.ch - startPos.ch);
            chars.forEach(char => {
                if (char.value == "\n") newLineRemoved = true;
            })
        }

        this.broadcastDelete(chars);
        this.removeEmptyLines(); // ...

        if (newLineRemoved && this.data[startPos.line + 1]) {
            this.mergeLines(startPos.line);
        }
    }

    broadcastDelete(chars) {
        chars.forEach(char => {
            this.clock.increment();
            this.controller.broadcastDelete(char);
        })
    }

    removeEmptyLines() {
        let cond = false;
        for (let i = 0; i < this.data.length; i++) {
            if (this.data[i].length === 0 && cond) {
                this.data.splice(i, 1);
                i--;
            }
            else if (this.data[i].length === 0) cond = true;
        }

        if (this.data.length == 0) {
            this.data.push([]);
        }
    }

    mergeLines(ch) {
        const newLine = this.data[ch].concat(this.data[ch + 1]);
        this.data.splice(ch, 2, newLine);
    }

    remoteDelete(char, siteId) {
        const pos = this.findPosition(char);
        this.data[pos.line].splice(pos.ch, 1);

        if (char.value == "\n" && this.data[pos.line + 1]) {
            this.mergeLines(pos.line);
        }
        // this.removeEmptyLines();
        this.controller.deleteInEditor(char.value, pos, siteId);
    }


    size() {
        return this.data.map(line => line.length).reduce((sum, num) => sum + num);
    }

    toText() {
        return this.data.map(line => line.map(char => char.value).join("")).join("");
    }

}

module.exports = CRDT;
},{"./Char":1,"./Identifier":5}],4:[function(require,module,exports){


class Editor {
    constructor(codemirror) {
        this.codemirror = codemirror;
        this.controller = null;
        this.customKeys();
        this.bindBeforeChange();
        this.bindCursorActivity();
        this.cursorInd = null;
        this.remoteCursorChange = false;
    }

    bindBeforeChange() {
        this.codemirror.on("beforeChange", (cdm, changeObj) => {
            if (changeObj.origin === "paste") {
                this.cursorInd = cdm.getCursor().ch;
            }
        });
    }

    bindCursorActivity() {
        this.codemirror.on("cursorActivity", (cdm) => {
            const head = cdm.getCursor();
            const anchor = cdm.getCursor("anchor");
            // console.log("head : ", head);
            // console.log("anchor : ", anchor);
            const range = {
                head, anchor,
            };
            if(!this.remoteCursorChange)
                this.controller.broadcastSelection(range);
            else this.remoteCursorChange = false;
        });

        // this.codemirror.on("beforeSelectionChange", (cdm, selection) => {
        //     console.log(selection.origin);
        //     if (selection.origin === "+move") {
        //         const range = {
        //             anchor: selection.ranges[0].anchor,
        //             head: selection.ranges[0].head,
        //         }
        //         console.log(range);
        //         this.controller.broadcastSelection(range);
        //     }
        // })
    }

    bindChangeEvents() {
        // this.replaceText("");
        // this.codemirror.setValue("//<Write your code here>\n//Share the link to invite collaborators to your document");
        this.codemirror.on("change", (cdm, changeObj) => {
            const retChanges = ["setValue", "insertChar", "deleteChar"];
            if (retChanges.includes(changeObj.origin)) return;

            switch (changeObj.origin) {
                case "redo":
                case "undo":
                    this.performUndoRedo(changeObj);
                    break;
                case "paste":
                    this.performPaste(changeObj);
                    break;
                case "*compose":
                case "+input":
                    this.performInsert(changeObj);
                    break;
                case "+delete":
                case "cut":
                    this.performDelete(changeObj);
                    break;
                default:
                    console.log("operation not caught in Editor : ", changeObj.orign);
            }
        });
    }

    customKeys() {
        this.codemirror.setOption("extraKeys", {
            Tab: function (codemirror) {
                codemirror.replaceSelection("\t");
            }
        });
    }

    // setCursor(cursor) {
    //     console.log("setting curosr");
    //     this.codemirror.setCursor({ line: cursor.line, ch: cursor.ch });
    // }

    setSelection(range){
        console.log("setting range");
        this.remoteCursorChange = true;
        this.codemirror.setSelection(range.anchor, range.head, "setSelection");
    }

    performPaste(changeObj) {
        // const cursor = this.codemirror.getCursor();
        // changeObj.from.ch = cursor.ch-1;

        changeObj.from.ch = this.cursorInd;
        this.performInsert(changeObj);
    }

    performUndoRedo(changeObj) {
        console.log("inside undo redo");
        const del = changeObj.removed;
        console.log(changeObj.text);
        if (del.length == 1 && del[0].length == 0) {
            this.performInsert(changeObj);
        }
        else {
            this.performDelete(changeObj);
        }
    }

    performInsert(changeObj) {
        this.performDelete(changeObj); // ...
        const startPos = changeObj.from;
        const chars = this.getChars(changeObj.text);
        this.controller.localInsert(chars, startPos);
    }

    performDelete(changeObj) {
        const del = changeObj.removed;
        if (del.length == 1 && del[0].length == 0) return;
        const startPos = changeObj.from;
        const endPos = changeObj.to;
        // const chars = this.getChars(changeObj.text);
        this.controller.localDelete(startPos, endPos);
    }

    getChars(text) {
        if (text[0] === '' && text[1] === '' && text.length === 2) {
            return '\n';
        } else {
            return text.join("\n");
        }
    }

    replaceText(text) {
        this.codemirror.doc.setValue(text);
        this.codemirror.execCommand("goDocEnd");
    }

    insertChar(value, positions, siteId) {
        this.codemirror.replaceRange(value, positions.from, positions.to, "insertChar");
    }

    deleteChar(value, positions, siteId) {
        this.codemirror.replaceRange("", positions.from, positions.to, "deleteChar");
    }

}


module.exports = Editor;
},{}],5:[function(require,module,exports){

class Identifier{

    constructor(digit, siteId){
        this.digit = digit;
        this.siteId = siteId;
    }

    compareIdentifier(id){
        if(this.digit < id.digit) return -1;
        else if(this.digit > id.digit) return 1;
        else{
            if(this.siteId < id.siteId) return -1;
            else if(this.siteId > id.siteId) return 1;
            else return 0;
        }
    }
}

module.exports = Identifier;
},{}],6:[function(require,module,exports){

const config = {
    'iceServers': [{ 'urls': 'stun:stun.1.google.com:19302' }]
};

class Peer {

    constructor(siteId) {
        this.siteId = siteId;
        this.outConn = []; // outgoing peer connections
        this.inConn = []; // incoming peer connections
        this.dc = []; // dataChannels of the peer connections
        this.controller = null;

        fetch(`https://coderoom.metered.live/api/v1/turn/credentials?apiKey=${'086477e41a569760384a2b60353c9f0da3f2'}`)
            .then(response => response.json())
            .then((result) => { config.iceServers.push(...result), console.log("Hello, ", config); })
            .catch(err => console.log(err));
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
        console.log(config);
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


module.exports = Peer;
},{}],7:[function(require,module,exports){


class Version {
    constructor(siteId) {
        this.siteId = siteId;
        this.counter = 0;
        this.history = [];
    }

    commit(version){
        
        if(version.counter <= this.counter){
            const index = this.history.filter(counter => counter != version.counter);
        }
        else if(version.counter == this.counter + 1){
            this.counter += 1;
        }
        else{
            for(let i = this.counter + 1; i<= version.counter;i++){
                this.history.push(i);
            }

            this.counter = version.counter;
        }
    }
}


module.exports = Version;
},{}],8:[function(require,module,exports){
const Version = require("./Version");

class VersionClock{

    constructor(siteId){
        this.siteId = siteId;
        this.localVersion = new Version(siteId);
        this.versions = [];
        this.versions.push(this.localVersion);
    }

    update(version){ // for remote operations
        const localVersion = this.getLocalVersion(version);

        if(localVersion === undefined){
            const newVersion = new Version(version.siteId);
            newVersion.commit(version);
            this.versions.push(newVersion);
        }
        else{
            localVersion.commit(version);
        }
    }

    alreadyCommited(version){
        const localVersion = this.getLocalVersion(version);
        if(localVersion === undefined) return false;
        return localVersion.counter >= version.counter;
    }

    getLocalVersion(version){
        return this.versions.find(ver=> ver.siteId === version.siteId);
    }

    makeLocalVersion(){
        return {
            siteId : this.localVersion.siteId ,
            counter : this.localVersion.counter,
        }
    }

    increment(){ // for local operations
        this.localVersion.counter++;
    }

}

module.exports = VersionClock;
},{"./Version":7}],9:[function(require,module,exports){

const Controller = require("./Controller");
const Editor = require("./Editor");
const textArea = document.querySelector("#textArea");
const configCdm = {
    // value :" <Write your code here, Share the link to invite collaborators to your document.>",
    spellChecker: false,
    toolbar: false,
    autofocus: true,
    indentWithTabs: true,
    tabSize: 4,
    indentUnit: 4,
    lineWrapping: false,
    shortCuts: [],
    lineNumbers : true,
    mode : "text/x-c++src",
    theme : 'monokai',
    matchBrackets : true,
    // matchTags : true, 
    closeBrackets : true,
    ruler : true,
    fullScreen : true,
}

var codemirror = CodeMirror.fromTextArea(textArea, configCdm);
const controller = new Controller(new Editor(codemirror), roomId);

controller.initServer();

// async function connect() {
//     for (let id of controller.network) {
//         if (id !== controller.peerId) {
//             console.log(id);
//             controller.sendConnectionRequest(id);
//         }
//     }
// }


// function send() {
//     let dch;
//     for (let id of controller.network) {
//         if (id !== controller.peerId)
//             dch = controller.peer.getDataChannel(id);
//     }
//     console.log(dch);
//     const message = {
//         type : "print", 
//         data : "ooogog",
//     }
//     dch.send(JSON.stringify(message));
// }



},{"./Controller":2,"./Editor":4}]},{},[9]);
