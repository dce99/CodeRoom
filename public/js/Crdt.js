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