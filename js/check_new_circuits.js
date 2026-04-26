// Dialog that alerts for new circuits
"use strict";
// globals: document, window, CA

var SC = window.SC || {};

SC.checkNewCircuits = function () {
    // Silently mark all new circuits as seen on startup
    var c, changed = false;
    for (c in SC.circuit) {
        if (SC.circuit.hasOwnProperty(c) && !SC.seen[c]) {
            SC.seen[c] = 1;
            changed = true;
        }
    }
    if (changed) {
        CA.storage.writeObject('SC.seen', SC.seen);
    }
};

