'use strict';
// globals: document, SC
var SC = window.SC || {};

SC.submit = {

    open: function () {
        if (!SC.auth.user) {
            SC.auth.openModal();
            return;
        }
        var overlay = document.getElementById('submit-modal-overlay');
        if (overlay) { overlay.classList.add('open'); }
        SC.submit._resetForm();
    },

    close: function () {
        var overlay = document.getElementById('submit-modal-overlay');
        if (overlay) { overlay.classList.remove('open'); }
    },

    _resetForm: function () {
        var ids = ['submit-name', 'submit-author', 'submit-url-schematic',
                   'submit-url-stripboard', 'submit-url-perfboard', 'submit-url-pcb',
                   'submit-url-tagboard', 'submit-url-demo', 'parts-json-input'];
        ids.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.value = ''; }
        });
        var status = document.getElementById('submit-status');
        if (status) { status.textContent = ''; status.className = 'sc-status'; }
        var list = document.getElementById('parts-rows-list');
        if (list) { list.innerHTML = ''; }
        var empty = document.getElementById('parts-rows-empty');
        if (empty) { empty.style.display = ''; }
        SC.submit._switchTab('rows');
    },

    _switchTab: function (tab) {
        document.getElementById('parts-tab-rows').classList.toggle('active', tab === 'rows');
        document.getElementById('parts-tab-json').classList.toggle('active', tab === 'json');
        document.getElementById('parts-panel-rows').style.display = tab === 'rows' ? '' : 'none';
        document.getElementById('parts-panel-json').style.display = tab === 'json' ? '' : 'none';
    },

    _TYPES: {
        R:  { label: 'Resistor',   color: 'resistor',   hint: '10k'     },
        C:  { label: 'Capacitor',  color: 'capacitor',  hint: '100n'    },
        P:  { label: 'Pot',        color: 'pot',        hint: '100k'    },
        Q:  { label: 'Transistor', color: 'transistor', hint: 'BC549C'  },
        D:  { label: 'Diode',      color: 'diode',      hint: '1N4148'  },
        U:  { label: 'IC',         color: 'ic',         hint: 'TL072'   },
        SW: { label: 'Switch',     color: 'sw',         hint: 'DPDT'    },
        '': { label: 'Other',      color: 'other',      hint: '…'       }
    },

    _nextDesignator: function (prefix) {
        if (!prefix) { return ''; }
        var list = document.getElementById('parts-rows-list');
        var count = 0;
        if (list) {
            list.querySelectorAll('.sc-designator-input').forEach(function (inp) {
                if (inp.value.toUpperCase().indexOf(prefix.toUpperCase()) === 0) { count++; }
            });
        }
        return prefix + (count + 1);
    },

    _addComponent: function (prefix, typeDef) {
        var list = document.getElementById('parts-rows-list');
        var empty = document.getElementById('parts-rows-empty');
        if (!list) { return; }
        if (empty) { empty.style.display = 'none'; }

        var row = document.createElement('div');
        row.className = 'sc-parts-row';

        var badge = document.createElement('span');
        badge.className = 'sc-type-badge ' + typeDef.color;
        badge.textContent = typeDef.label;

        var desInput = document.createElement('input');
        desInput.className = 'sc-designator-input';
        desInput.value = SC.submit._nextDesignator(prefix);
        desInput.placeholder = prefix ? prefix + '1' : 'X1';

        var valInput = document.createElement('input');
        valInput.className = 'sc-value-input';
        valInput.placeholder = typeDef.hint;

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'sc-remove-btn';
        removeBtn.textContent = '×';
        removeBtn.onclick = function () {
            list.removeChild(row);
            if (list.children.length === 0 && empty) { empty.style.display = ''; }
        };

        row.appendChild(badge);
        row.appendChild(desInput);
        row.appendChild(valInput);
        row.appendChild(removeBtn);
        list.appendChild(row);
        setTimeout(function () { valInput.focus(); }, 0);
    },

    _collectParts: function () {
        var jsonPanel = document.getElementById('parts-panel-json');
        if (jsonPanel.style.display !== 'none') {
            var raw = document.getElementById('parts-json-input').value.trim();
            if (!raw) { return { ok: false, error: 'Paste your parts list, JSON wizard.' }; }
            try {
                var parsed = JSON.parse(raw);
                if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                    return { ok: false, error: 'Parts must be a JSON object like {"R1": "10k"}.' };
                }
                return { ok: true, parts: parsed };
            } catch (e) {
                return { ok: false, error: 'Invalid JSON: ' + e.message };
            }
        }
        var list = document.getElementById('parts-rows-list');
        var rows = list ? list.querySelectorAll('.sc-parts-row') : [];
        var parts = {};
        var hasAny = false;
        rows.forEach(function (row) {
            var des = row.querySelector('.sc-designator-input');
            var val = row.querySelector('.sc-value-input');
            if (des && val && des.value.trim() && val.value.trim()) {
                parts[des.value.trim()] = val.value.trim();
                hasAny = true;
            }
        });
        if (!hasAny) { return { ok: false, error: 'Add at least one part — even a blank pedal needs a resistor.' }; }
        return { ok: true, parts: parts };
    },

    send: function () {
        var nameEl   = document.getElementById('submit-name');
        var statusEl = document.getElementById('submit-status');
        var sendBtn  = document.getElementById('submit-modal-send');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
            statusEl.textContent = 'Give it a name, tone chaser.';
            statusEl.className = 'sc-status error';
            return;
        }
        var partsResult = SC.submit._collectParts();
        if (!partsResult.ok) {
            statusEl.textContent = partsResult.error;
            statusEl.className = 'sc-status error';
            return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending it in…';
        statusEl.textContent = '';
        statusEl.className = 'sc-status';

        var key = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        var row = {
            key:            key + '_' + Date.now(),
            name:           name,
            author:         (document.getElementById('submit-author').value.trim()) || null,
            url_schematic:  (document.getElementById('submit-url-schematic').value.trim())  || null,
            url_stripboard: (document.getElementById('submit-url-stripboard').value.trim()) || null,
            url_perfboard:  (document.getElementById('submit-url-perfboard').value.trim())  || null,
            url_pcb:        (document.getElementById('submit-url-pcb').value.trim())        || null,
            url_tagboard:   (document.getElementById('submit-url-tagboard').value.trim())   || null,
            url_pedal:      null,
            url_demo:       (document.getElementById('submit-url-demo').value.trim())       || null,
            parts:          partsResult.parts,
            status:         'pending',
            submitted_by:   SC.auth.user.id
        };

        SC.auth.client.from('circuits').insert(row).then(function (result) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Submit for review →';
            if (result.error) {
                statusEl.textContent = 'Error: ' + result.error.message;
                statusEl.className = 'sc-status error';
            } else {
                statusEl.textContent = '🎸 Submitted! We\'ll check it out soon.';
                statusEl.className = 'sc-status success';
                setTimeout(SC.submit.close, 2000);
            }
        });
    },

    init: function () {
        var openBtn   = document.getElementById('submit-layout-btn');
        var closeBtn  = document.getElementById('submit-modal-close');
        var cancelBtn = document.getElementById('submit-modal-cancel');
        var sendBtn   = document.getElementById('submit-modal-send');
        var tabRows   = document.getElementById('parts-tab-rows');
        var tabJson   = document.getElementById('parts-tab-json');
        var overlay   = document.getElementById('submit-modal-overlay');

        if (openBtn)   { openBtn.onclick   = SC.submit.open; }
        if (closeBtn)  { closeBtn.onclick  = SC.submit.close; }
        if (cancelBtn) { cancelBtn.onclick = SC.submit.close; }
        if (sendBtn)   { sendBtn.onclick   = SC.submit.send; }
        if (tabRows)   { tabRows.onclick   = function () { SC.submit._switchTab('rows'); }; }
        if (tabJson)   { tabJson.onclick   = function () { SC.submit._switchTab('json'); }; }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { SC.submit.close(); }
            });
        }
        var typePicker = document.getElementById('parts-type-picker');
        if (typePicker) {
            typePicker.querySelectorAll('.sc-type-btn').forEach(function (btn) {
                btn.onclick = function () {
                    var prefix  = btn.dataset.prefix;
                    var typeDef = SC.submit._TYPES[prefix] || SC.submit._TYPES[''];
                    SC.submit._addComponent(prefix, typeDef);
                };
            });
        }
    }
};
