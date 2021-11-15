
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


