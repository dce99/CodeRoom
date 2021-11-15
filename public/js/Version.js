

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


// module.exports = Version;