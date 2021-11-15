// const Identifier = require("./Identifier");

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

// module.exports = Char;

