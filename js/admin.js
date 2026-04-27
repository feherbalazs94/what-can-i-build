'use strict';
// globals: document, SC
var SC = window.SC || {};

SC.admin = {

    checkAccessAndInit: function () {
        if (!SC.auth.user) {
            document.getElementById('admin-access-denied').style.display = 'block';
            return;
        }
        SC.auth.client
            .from('user_roles')
            .select('role')
            .eq('user_id', SC.auth.user.id)
            .maybeSingle()
            .then(function (result) {
                if (result.data && result.data.role === 'admin') {
                    document.getElementById('admin-content').style.display = 'block';
                    SC.admin._initTabs();
                    SC.admin.loadPanel('pending');
                    SC.admin._initGrantAdmin();
                } else {
                    document.getElementById('admin-access-denied').style.display = 'block';
                }
            });
    },

    _initTabs: function () {
        document.querySelectorAll('.admin-tab').forEach(function (tab) {
            tab.onclick = function () {
                document.querySelectorAll('.admin-tab').forEach(function (t) { t.classList.remove('active'); });
                document.querySelectorAll('.admin-tab-panel').forEach(function (p) { p.classList.remove('active'); });
                tab.classList.add('active');
                document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
                SC.admin.loadPanel(tab.dataset.tab);
            };
        });
    },

    loadPanel: function (tab) {
        if (tab === 'admins') { SC.admin.loadAdmins(); return; }
        var listEl = document.getElementById(tab + '-list');
        if (!listEl) { return; }
        listEl.innerHTML = '<div class="admin-empty">Loading…</div>';

        SC.auth.client
            .from('circuits')
            .select('id, key, name, author, url_schematic, url_stripboard, url_perfboard, url_pcb, url_tagboard, url_pedal, url_demo, parts, submitted_by, created_at')
            .eq('status', tab)
            .order('created_at', { ascending: false })
            .then(function (result) {
                listEl.innerHTML = '';
                if (result.error || !result.data || result.data.length === 0) {
                    listEl.innerHTML = '<div class="admin-empty">Nothing here.</div>';
                    if (tab === 'pending') {
                        document.getElementById('pending-badge').textContent = '0';
                    }
                    return;
                }
                if (tab === 'pending') {
                    document.getElementById('pending-badge').textContent = result.data.length;
                }
                result.data.forEach(function (circuit) {
                    listEl.appendChild(SC.admin._renderCard(circuit, tab));
                });
            });
    },

    _renderCard: function (circuit, currentStatus) {
        var card = document.createElement('div');
        card.className = 'admin-card';

        var name = document.createElement('div');
        name.className = 'admin-card-name';
        name.textContent = circuit.name + (circuit.author ? ' — ' + circuit.author : '');
        card.appendChild(name);

        var meta = document.createElement('div');
        meta.className = 'admin-card-meta';
        var partCount = Object.keys(circuit.parts || {}).length;
        meta.innerHTML = 'submitted by <b>' + (circuit.submitted_by || 'seeded') + '</b> &nbsp;·&nbsp; ' +
            new Date(circuit.created_at).toLocaleDateString() + ' &nbsp;·&nbsp; ' + partCount + ' parts';
        card.appendChild(meta);

        var pillRow = document.createElement('div');
        pillRow.className = 'admin-parts-chips';
        ['url_schematic','url_stripboard','url_perfboard','url_pcb','url_tagboard','url_pedal','url_demo'].forEach(function (field) {
            if (circuit[field]) {
                var pill = document.createElement('a');
                pill.className = 'admin-part-chip';
                pill.href = circuit[field];
                pill.target = '_blank';
                pill.textContent = field.replace('url_', '');
                pillRow.appendChild(pill);
            }
        });
        card.appendChild(pillRow);

        var chips = document.createElement('div');
        chips.className = 'admin-parts-chips';
        var parts = circuit.parts || {};
        var keys = Object.keys(parts).slice(0, 12);
        keys.forEach(function (k) {
            var chip = document.createElement('span');
            chip.className = 'admin-part-chip';
            chip.textContent = k + ': ' + parts[k];
            chips.appendChild(chip);
        });
        if (Object.keys(parts).length > 12) {
            var more = document.createElement('span');
            more.className = 'admin-part-chip';
            more.textContent = '…+' + (Object.keys(parts).length - 12) + ' more';
            chips.appendChild(more);
        }
        card.appendChild(chips);

        var actions = document.createElement('div');
        actions.className = 'admin-actions';

        if (currentStatus !== 'approved') {
            var approveBtn = document.createElement('button');
            approveBtn.className = 'admin-btn-approve';
            approveBtn.textContent = '✓ Approve';
            approveBtn.onclick = function () { SC.admin._setStatus(circuit.id, 'approved', card); };
            actions.appendChild(approveBtn);
        }

        if (currentStatus !== 'rejected') {
            var rejectBtn = document.createElement('button');
            rejectBtn.className = 'admin-btn-reject';
            rejectBtn.textContent = '✕ Reject';
            rejectBtn.onclick = function () { SC.admin._setStatus(circuit.id, 'rejected', card); };
            actions.appendChild(rejectBtn);
        }

        if (currentStatus === 'rejected') {
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'admin-btn-neutral';
            deleteBtn.textContent = 'Delete permanently';
            deleteBtn.onclick = function () {
                if (confirm('Delete this circuit permanently?')) {
                    SC.admin._deleteCircuit(circuit.id, card);
                }
            };
            actions.appendChild(deleteBtn);
        }

        card.appendChild(actions);
        return card;
    },

    _setStatus: function (circuitId, status, cardEl) {
        SC.auth.client
            .from('circuits')
            .update({ status: status })
            .eq('id', circuitId)
            .then(function (result) {
                if (!result.error) {
                    cardEl.style.opacity = '0.4';
                    setTimeout(function () { cardEl.remove(); }, 400);
                    if (status === 'approved' || status === 'rejected') {
                        var badge = document.getElementById('pending-badge');
                        if (badge) {
                            badge.textContent = Math.max(0, parseInt(badge.textContent, 10) - 1);
                        }
                    }
                }
            });
    },

    _deleteCircuit: function (circuitId, cardEl) {
        SC.auth.client
            .from('circuits')
            .delete()
            .eq('id', circuitId)
            .then(function (result) {
                if (!result.error) { cardEl.remove(); }
            });
    },

    loadAdmins: function () {
        var list = document.getElementById('admins-list');
        if (!list) { return; }
        list.innerHTML = '';

        SC.auth.client
            .from('user_roles')
            .select('user_id, role, granted_at')
            .eq('role', 'admin')
            .then(function (result) {
                if (result.error || !result.data) { return; }
                result.data.forEach(function (row) {
                    var item = document.createElement('div');
                    item.className = 'admin-card';
                    item.style.flexDirection = 'row';
                    item.style.alignItems = 'center';
                    var info = document.createElement('div');
                    info.style.flex = '1';
                    info.innerHTML = '<b>' + row.user_id + '</b> <span style="color:#475569;font-size:11px">— granted ' + new Date(row.granted_at).toLocaleDateString() + '</span>';
                    item.appendChild(info);
                    if (row.user_id !== SC.auth.user.id) {
                        var revokeBtn = document.createElement('button');
                        revokeBtn.className = 'admin-btn-reject';
                        revokeBtn.textContent = 'Revoke';
                        revokeBtn.onclick = function () { SC.admin._revokeAdmin(row.user_id, item); };
                        item.appendChild(revokeBtn);
                    }
                    list.appendChild(item);
                });
            });
    },

    _initGrantAdmin: function () {
        var btn    = document.getElementById('grant-admin-btn');
        var input  = document.getElementById('grant-email-input');
        var status = document.getElementById('grant-status');
        if (!btn) { return; }

        btn.onclick = function () {
            var email = input.value.trim();
            if (!email || email.indexOf('@') === -1) {
                status.textContent = 'Enter a valid email.';
                status.className = 'sc-status error';
                return;
            }
            btn.disabled = true;
            status.textContent = 'To grant admin by email, run in SQL Editor: ' +
                'INSERT INTO public.user_roles (user_id, role) ' +
                'SELECT id, \'admin\' FROM auth.users WHERE email = \'' + email + '\';';
            status.className = 'sc-status';
            btn.disabled = false;
        };
    },

    _revokeAdmin: function (userId, itemEl) {
        SC.auth.client
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .then(function (result) {
                if (!result.error) { itemEl.remove(); }
            });
    }
};
