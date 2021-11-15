
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

// module.exports = Identifier;