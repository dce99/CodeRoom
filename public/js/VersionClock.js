// const Version = require("./Version");

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

// module.exports = VersionClock;