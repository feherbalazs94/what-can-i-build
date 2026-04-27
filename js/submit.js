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
        var table = document.getElementById('parts-rows-table');
        if (table) {
            while (table.children.length > 1) { table.removeChild(table.lastChild); }
        }
        SC.submit._addPartRow();
        SC.submit._addPartRow();
        SC.submit._switchTab('rows');
    },

    _switchTab: function (tab) {
        document.getElementById('parts-tab-rows').classList.toggle('active', tab === 'rows');
        document.getElementById('parts-tab-json').classList.toggle('active', tab === 'json');
        document.getElementById('parts-panel-rows').style.display = tab === 'rows' ? '' : 'none';
        document.getElementById('parts-panel-json').style.display = tab === 'json' ? '' : 'none';
    },

    _addPartRow: function () {
        var table = document.getElementById('parts-rows-table');
        if (!table) { return; }
        var row     = document.createElement('div');
        row.className = 'sc-parts-row';
        var cellDes = document.createElement('div');
        cellDes.className = 'sc-parts-cell';
        var inDes = document.createElement('input');
        inDes.placeholder = 'C1';
        cellDes.appendChild(inDes);
        var cellVal = document.createElement('div');
        cellVal.className = 'sc-parts-cell';
        var inVal = document.createElement('input');
        inVal.placeholder = '100n';
        cellVal.appendChild(inVal);
        var cellBtn = document.createElement('div');
        cellBtn.className = 'sc-parts-cell';
        var btn = document.createElement('button');
        btn.className = 'sc-remove-btn';
        btn.textContent = '×';
        btn.onclick = function () { table.removeChild(row); };
        cellBtn.appendChild(btn);
        row.appendChild(cellDes);
        row.appendChild(cellVal);
        row.appendChild(cellBtn);
        table.appendChild(row);
    },

    _collectParts: function () {
        var jsonPanel = document.getElementById('parts-panel-json');
        if (jsonPanel.style.display !== 'none') {
            var raw = document.getElementById('parts-json-input').value.trim();
            if (!raw) { return { ok: false, error: 'Parts list is required.' }; }
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
        var table = document.getElementById('parts-rows-table');
        var rows  = table.querySelectorAll('.sc-parts-row:not(:first-child)');
        var parts = {};
        var hasAny = false;
        rows.forEach(function (row) {
            var inputs = row.querySelectorAll('input');
            var des = inputs[0].value.trim();
            var val = inputs[1].value.trim();
            if (des && val) { parts[des] = val; hasAny = true; }
        });
        if (!hasAny) { return { ok: false, error: 'Add at least one component.' }; }
        return { ok: true, parts: parts };
    },

    send: function () {
        var nameEl   = document.getElementById('submit-name');
        var statusEl = document.getElementById('submit-status');
        var sendBtn  = document.getElementById('submit-modal-send');
        var name = nameEl ? nameEl.value.trim() : '';
        if (!name) {
            statusEl.textContent = 'Circuit name is required.';
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
        sendBtn.textContent = 'Submitting…';
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
                statusEl.textContent = '✓ Submitted! We\'ll review it shortly.';
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
        var addRow    = document.getElementById('parts-add-row');
        var tabRows   = document.getElementById('parts-tab-rows');
        var tabJson   = document.getElementById('parts-tab-json');
        var overlay   = document.getElementById('submit-modal-overlay');

        if (openBtn)   { openBtn.onclick   = SC.submit.open; }
        if (closeBtn)  { closeBtn.onclick  = SC.submit.close; }
        if (cancelBtn) { cancelBtn.onclick = SC.submit.close; }
        if (sendBtn)   { sendBtn.onclick   = SC.submit.send; }
        if (addRow)    { addRow.onclick    = SC.submit._addPartRow; }
        if (tabRows)   { tabRows.onclick   = function () { SC.submit._switchTab('rows'); }; }
        if (tabJson)   { tabJson.onclick   = function () { SC.submit._switchTab('json'); }; }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { SC.submit.close(); }
            });
        }
        SC.submit._addPartRow();
        SC.submit._addPartRow();
    }
};
