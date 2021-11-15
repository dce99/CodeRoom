

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


// module.exports = Editor;