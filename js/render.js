// Render one circuit
"use strict";
// globals: document, window, CA

var SC = window.SC || {};

SC.URL_LABELS = {
    schematic: 'sch',
    stripboard: 'strip',
    perfboard: 'perf',
    pcb: 'pcb',
    tagboard: 'tag',
    pedal: 'pedal',
    demo: '🎵 demo'
};

SC.renderUrl = function (aContainer, aIcon, aUrl) {
    // Render one url link pill inside aContainer
    if (!aUrl) {
        return;
    }
    var a = document.createElement('a');
    a.href = aUrl;
    a.textContent = SC.URL_LABELS[aIcon] || aIcon;
    a.target = '_blank';
    aContainer.appendChild(a);
};

SC.complexity = function (aCircuit) {
    // Return summary of circuit complexity, e.g.  6: 2C 1D 1P 1R 1T
    var u = {}, k, prefix, arr = [], t = 0;
    for (k in aCircuit.parts) {
        if (aCircuit.parts.hasOwnProperty(k)) {
            prefix = k.match(/^[A-Z]+/)[0];
            if (prefix === 'U') {
                continue;
            }
            u[prefix] = u[prefix] || 0;
            u[prefix]++;
            t++;
        }
    }
    for (k in u) {
        if (u.hasOwnProperty(k)) {
            arr.push({type: k, count: u[k]});
        }
    }
    return arr.sort(function (a, b) {
        return a.type === b.type ? 0 : a.type < b.type ? -1 : 1;
    }).map(function (a) {
        return a.count + a.type;
    }).join(' ');
};

SC.renderVoteCol = function (aCircuit) {
    // Returns a <td> with ▲ score ▼ vote buttons
    var td, wrap, btnUp, score, btnDown;
    td = document.createElement('td');
    wrap = document.createElement('div');
    wrap.className = 'vote-col';

    btnUp = document.createElement('button');
    btnUp.className = 'vote-btn up';
    btnUp.textContent = '▲';
    btnUp.title = 'Upvote';
    btnUp.dataset.circuitId = aCircuit.id;
    btnUp.dataset.value = '1';

    score = document.createElement('span');
    score.className = 'vote-score' + (aCircuit.vote_score > 0 ? ' positive' : aCircuit.vote_score < 0 ? ' negative' : '');
    score.textContent = aCircuit.vote_score || 0;
    score.dataset.circuitId = aCircuit.id;

    btnDown = document.createElement('button');
    btnDown.className = 'vote-btn down';
    btnDown.textContent = '▼';
    btnDown.title = 'Downvote';
    btnDown.dataset.circuitId = aCircuit.id;
    btnDown.dataset.value = '-1';

    btnUp.onclick   = function () { SC.vote.cast(aCircuit.id,  1, score, btnUp, btnDown); };
    btnDown.onclick = function () { SC.vote.cast(aCircuit.id, -1, score, btnUp, btnDown); };

    wrap.appendChild(btnUp);
    wrap.appendChild(score);
    wrap.appendChild(btnDown);
    td.appendChild(wrap);
    return td;
};

SC.renderCommentsBtn = function (aKey, aCircuit) {
    // Returns a <td> with a 💬 N comments button
    var td, btn;
    td = document.createElement('td');
    btn = document.createElement('button');
    btn.className = 'comment-btn';
    btn.innerHTML = '💬 <span class="comment-count" id="ccount_' + aKey + '">…</span>';
    btn.onclick = function () { SC.comments.open(aCircuit.id, aCircuit.name, aKey); };
    td.appendChild(btn);
    return td;
};

SC.renderOne = function (aKey, aCircuit, aErrors, aWarnings) {
    // Render one circuit row for the "can build" section
    var tr, td, linksDiv, w, k, b, span, lc;
    tr = document.createElement('tr');
    tr.dataset.circuitKey = aKey;
    // links
    td = document.createElement('td');
    linksDiv = document.createElement('div');
    linksDiv.className = 'links';
    for (k in aCircuit.url) {
        if (aCircuit.url.hasOwnProperty(k)) {
            SC.renderUrl(linksDiv, k, aCircuit.url[k]);
        }
    }
    td.appendChild(linksDiv);
    tr.appendChild(td);
    // name + author
    td = document.createElement('td');
    td.className = 'full';
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    if (aCircuit.submitted_by) {
        var badge = document.createElement('span');
        badge.className = 'community-badge';
        badge.textContent = 'community';
        b.appendChild(badge);
    }
    td.appendChild(b);
    if (aCircuit.author) {
        span = document.createElement('div');
        span.className = 'circuit-author';
        span.textContent = 'by ' + aCircuit.author;
        td.appendChild(span);
    }
    // warnings (substitutions)
    if (aWarnings.length > 0) {
        w = document.createElement('div');
        w.className = 'warning';
        w.textContent = aWarnings.join(', ');
        w.title = 'Substitutions';
        td.appendChild(w);
    }
    tr.appendChild(td);
    // complexity
    td = document.createElement('td');
    td.className = 'complexity';
    b = document.createElement('b');
    b.textContent = Object.keys(aCircuit.parts).length + ': ';
    td.appendChild(b);
    td.appendChild(document.createTextNode(SC.complexity(aCircuit)));
    tr.appendChild(td);
    // actions
    td = document.createElement('td');
    lc = CA.labelCheckbox(td, 'done', SC.done[aCircuit.key]);
    lc.checkbox.onclick = function () {
        if (lc.checkbox.checked) {
            SC.done[aCircuit.key] = 1;
        } else {
            delete SC.done[aCircuit.key];
        }
        CA.storage.writeObject('SC.done', SC.done);
    };
    tr.appendChild(td);
    tr.appendChild(SC.renderVoteCol(aCircuit));
    tr.appendChild(SC.renderCommentsBtn(aKey, aCircuit));
    return tr;
};

SC.renderAlmost = function (aKey, aCircuit, aErrors, aWarnings) {
    // Render one circuit row for the "almost" section — shows missing part chips
    var tr, td, linksDiv, missingDiv, chip, w, k, b, span, lc, i;
    tr = document.createElement('tr');
    tr.dataset.circuitKey = aKey;
    // links
    td = document.createElement('td');
    linksDiv = document.createElement('div');
    linksDiv.className = 'links';
    for (k in aCircuit.url) {
        if (aCircuit.url.hasOwnProperty(k)) {
            SC.renderUrl(linksDiv, k, aCircuit.url[k]);
        }
    }
    td.appendChild(linksDiv);
    tr.appendChild(td);
    // name + author + missing chips
    td = document.createElement('td');
    td.className = 'full';
    b = document.createElement('b');
    b.className = 'circuit-name';
    b.textContent = aCircuit.name;
    if (aCircuit.submitted_by) {
        var badge = document.createElement('span');
        badge.className = 'community-badge';
        badge.textContent = 'community';
        b.appendChild(badge);
    }
    td.appendChild(b);
    if (aCircuit.author) {
        span = document.createElement('div');
        span.className = 'circuit-author';
        span.textContent = 'by ' + aCircuit.author;
        td.appendChild(span);
    }
    // missing parts chips
    missingDiv = document.createElement('div');
    missingDiv.className = 'missing-parts';
    for (i = 0; i < aErrors.length; i++) {
        chip = document.createElement('span');
        chip.className = 'missing-chip';
        chip.textContent = aErrors[i];
        missingDiv.appendChild(chip);
    }
    td.appendChild(missingDiv);
    // warnings (substitutions)
    if (aWarnings.length > 0) {
        w = document.createElement('div');
        w.className = 'warning';
        w.textContent = aWarnings.join(', ');
        w.title = 'Substitutions';
        td.appendChild(w);
    }
    tr.appendChild(td);
    // complexity
    td = document.createElement('td');
    td.className = 'complexity';
    b = document.createElement('b');
    b.textContent = Object.keys(aCircuit.parts).length + ': ';
    td.appendChild(b);
    td.appendChild(document.createTextNode(SC.complexity(aCircuit)));
    tr.appendChild(td);
    // actions
    td = document.createElement('td');
    lc = CA.labelCheckbox(td, 'done', SC.done[aCircuit.key]);
    lc.checkbox.onclick = function () {
        if (lc.checkbox.checked) {
            SC.done[aCircuit.key] = 1;
        } else {
            delete SC.done[aCircuit.key];
        }
        CA.storage.writeObject('SC.done', SC.done);
    };
    tr.appendChild(td);
    tr.appendChild(SC.renderVoteCol(aCircuit));
    tr.appendChild(SC.renderCommentsBtn(aKey, aCircuit));
    return tr;
};

