// Main page
"use strict";
// globals: document, window, CA

var SC = window.SC || {};

SC.refresh = function () {
    // Refresh both sections after counts update or checkbox change
    var f = SC.filter(SC.circuit, SC.counts),
        can = 0,
        almost = 0,
        total = Object.keys(SC.circuit).length,
        tr;

    SC.e.table_ok.textContent = '';
    SC.e.table_almost.textContent = '';

    f.forEach(function (a) {
        // Done filter: show only completed circuits in section 1
        if (SC.e.filter_show_done.checked) {
            if (SC.done[a.key]) {
                tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
                SC.e.table_ok.appendChild(tr);
            }
            return;
        }
        // Skip circuits the user has already marked done
        if (SC.done[a.key]) {
            return;
        }
        // Skip rows that require substitutions if filter is off
        if (!SC.e.filter_show_subs.checked && a.warnings.length > 0) {
            return;
        }
        if (a.errors.length === 0) {
            tr = SC.renderOne(a.key, a.circuit, a.errors, a.warnings);
            SC.e.table_ok.appendChild(tr);
            can++;
        } else if (a.errors.length <= 3) {
            tr = SC.renderAlmost(a.key, a.circuit, a.errors, a.warnings);
            SC.e.table_almost.appendChild(tr);
            almost++;
        }
    });

    SC.e.badge_ready.textContent = '✓ ' + can + ' ready';
    SC.e.badge_almost.textContent = '✦ ' + almost + ' almost';
    SC.e.count_ready.textContent = can + ' circuits — you have all the parts';
    SC.e.count_almost.textContent = almost + ' circuits — missing 1–3 parts';
    SC.e.total_count.textContent = '(' + can + '/' + total + ')';
    SC.e.nothing.style.display = (can <= 0 && almost <= 0 && !SC.e.filter_show_done.checked) ? 'block' : 'none';
};

SC.onUpdateCount = function (event) {
    var type = event.target.dataType,
        value = event.target.dataValue,
        count = event.target.value;
    SC.counts[type] = SC.counts[type] || {};
    SC.counts[type][value] = parseInt(count, 10);
    SC.refresh();
    CA.storage.writeObject('SC.counts', SC.counts);
    SC.updateSidebarCounts();
    SC.sync.schedule();
    SC.sync.updateBanner();
};

SC.createLabelInput = function (aType, aValue) {
    var label, span, input;
    label = document.createElement('label');
    label.className = 'type_' + aType + '_' + aValue;
    span = document.createElement('span');
    span.textContent = aValue.toString().replace('DARLINGTON', 'DARL');
    if (span.textContent.length > 8) {
        span.style.fontSize = 'x-small';
    }
    label.appendChild(span);
    input = document.createElement('input');
    input.type = 'number';
    input.min = 0;
    input.max = 100;
    input.step = 1;
    input.dataType = aType;
    input.dataValue = aValue;
    input.addEventListener('change', SC.onUpdateCount);
    input.addEventListener('input', SC.onUpdateCount);
    input.value = (SC.counts[aType] && SC.counts[aType][aValue]) || '';
    label.appendChild(input);
    return { label: label, span: span, input: input };
};

SC.showParts = function () {
    var k, c, n, t, v, a, val, use_eng, sec, i;
    for (k in SC.circuit) {
        if (SC.circuit.hasOwnProperty(k)) {
            c = SC.circuit[k];
            for (n in c.parts) {
                if (c.parts.hasOwnProperty(n)) {
                    t = SC.nameToType(n, k);
                    if (!SC.e['type_' + t]) {
                        alert('Type ' + t + ' has no section');
                    }
                    val = Array.isArray(c.parts[n]) ? c.parts[n] : [c.parts[n]];
                    for (v = 0; v < val.length; v++) {
                        if (!SC.values[t]) { SC.values[t] = {}; }
                        if (!SC.values[t][val[v]]) {
                            SC.values[t][val[v]] = SC.createLabelInput(t, val[v]);
                        }
                    }
                }
            }
        }
    }
    function value_compare(x, y) {
        if (x.value === y.value) { return 0; }
        return x.value < y.value ? -1 : 1;
    }
    for (t in SC.values) {
        if (SC.values.hasOwnProperty(t)) {
            a = [];
            use_eng = t === 'capacitor' || t === 'resistor' || t === 'pot' || t === 'pot_trimmer';
            for (v in SC.values[t]) {
                if (SC.values[t].hasOwnProperty(v)) {
                    val = v;
                    if (use_eng) { val = SC.fromEng(v.replace(' Stereo', '')); }
                    a.push({ v: v, value: val, li: SC.values[t][v] });
                }
            }
            sec = SC.e['type_' + t];
            a = a.sort(value_compare);
            for (i = 0; i < a.length; i++) { sec.appendChild(a[i].li.label); }
        }
    }
};

SC.plusTenAll = function (event) {
    event.stopPropagation();
    var t = event.target.id.replace('plus_10_', '');
    if (!confirm('Increase all ' + t + ' counts by 10?')) { return; }
    for (var v in SC.values[t]) {
        if (SC.values[t].hasOwnProperty(v)) {
            SC.counts[t] = SC.counts[t] || {};
            SC.counts[t][v] = SC.counts[t][v] || 0;
            SC.counts[t][v] += 10;
            SC.values[t][v].input.value = SC.counts[t][v];
        }
    }
    CA.storage.writeObject('SC.counts', SC.counts);
    SC.refresh();
    SC.updateSidebarCounts();
    SC.sync.schedule();
    SC.sync.updateBanner();
};

SC.updateSidebarCounts = function () {
    var t, v, entered, section, badge;
    for (t in SC.values) {
        if (!SC.values.hasOwnProperty(t)) { continue; }
        entered = 0;
        for (v in SC.counts[t] || {}) {
            if ((SC.counts[t][v] || 0) > 0) { entered++; }
        }
        badge = document.getElementById('scount_' + t);
        if (badge) {
            badge.textContent = entered > 0 ? entered : '';
        }
        section = document.getElementById('sd-' + t);
        if (section) {
            if (entered > 0) {
                section.classList.add('has-data');
            } else {
                section.classList.remove('has-data');
            }
        }
    }
};

SC.exact = function (aPartsCounts) {
    var k, c = {}, j, ok, z, ret = [], url;
    for (k in SC.circuit) {
        if (SC.circuit.hasOwnProperty(k)) {
            c = {};
            for (j in SC.circuit[k].parts) {
                if (SC.circuit[k].parts.hasOwnProperty(j)) {
                    z = j.match(/^[A-Z]+/)[0];
                    c[z] = c[z] || 0;
                    c[z]++;
                }
            }
            ok = true;
            for (j in aPartsCounts) {
                if (aPartsCounts.hasOwnProperty(j)) {
                    if (c[j] !== aPartsCounts[j]) { ok = false; }
                }
            }
            if (ok) {
                console.log(SC.circuit[k].name, SC.circuit[k].parts);
                url = '';
                for (j in SC.circuit[k].url) {
                    if (SC.circuit[k].url.hasOwnProperty(j)) {
                        if (SC.circuit[k].url[j] !== '') { url = SC.circuit[k].url[j]; break; }
                    }
                }
                ret.push('- [' + k + '](' + url + ')');
            }
        }
    }
    console.log(ret.join('\n'));
};

// ── Welcome screen ────────────────────────────────────────────────────────────

SC.dismissWelcome = function () {
    var el = document.getElementById('welcome-screen');
    if (!el) { return; }
    el.classList.add('hiding');
    setTimeout(function () { el.style.display = 'none'; }, 380);
    localStorage.setItem('SC.welcome_dismissed', '1');
};

SC.showWelcomeIfNeeded = function () {
    var dismissed = localStorage.getItem('SC.welcome_dismissed') === '1';
    if (dismissed || SC.sync.hasAnyParts()) {
        var el = document.getElementById('welcome-screen');
        if (el) { el.style.display = 'none'; }
    }
};

// ── Boot ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', function () {
    SC.e = CA.elementsWithId();

    // Filter checkboxes
    SC.e.filter_show_subs.onclick = SC.refresh;
    SC.e.filter_show_done.onclick = SC.refresh;

    // +10 all buttons
    SC.e.plus_10_resistor.onclick    = SC.plusTenAll;
    SC.e.plus_10_capacitor.onclick   = SC.plusTenAll;
    SC.e.plus_10_pot.onclick         = SC.plusTenAll;
    SC.e.plus_10_pot_trimmer.onclick = SC.plusTenAll;
    SC.e.plus_10_diode.onclick       = SC.plusTenAll;
    SC.e.plus_10_switch.onclick      = SC.plusTenAll;

    // Load circuits async from Supabase, then boot the UI
    SC.loadCircuits().then(function () {
        var loader = document.getElementById('circuits-loading');
        if (loader) { loader.style.display = 'none'; }
        SC.showParts();
        SC.refresh();
        SC.updateSidebarCounts();
        SC.checkNewCircuits();
        SC.deepLink.resolve();
        SC.submit.init();
        SC.comments.init();
    });

    // Welcome screen
    SC.showWelcomeIfNeeded();

    var startBtn  = document.getElementById('welcome-start');
    var signinBtn = document.getElementById('welcome-signin');
    if (startBtn)  { startBtn.onclick  = SC.onboarding.show; }
    if (signinBtn) {
        signinBtn.onclick = function () {
            SC.dismissWelcome();
            SC.auth.openModal();
        };
    }

    // Auth modal
    var closeBtn = document.getElementById('auth-modal-close');
    var sendBtn  = document.getElementById('auth-modal-send');
    var modal    = document.getElementById('auth-modal');
    if (closeBtn) { closeBtn.onclick = SC.auth.closeModal; }
    if (sendBtn)  { sendBtn.onclick  = SC.auth.handleModalSubmit; }
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) { SC.auth.closeModal(); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                SC.auth.closeModal();
            }
        });
        // Submit on Enter key in email field
        var emailInput = document.getElementById('auth-email-input');
        if (emailInput) {
            emailInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { SC.auth.handleModalSubmit(); }
            });
        }
    }

    // Sync banner → open modal
    var syncBanner = document.getElementById('sync-banner');
    if (syncBanner) {
        syncBanner.onclick = SC.auth.openModal;
        syncBanner.onkeydown = function (e) {
            if (e.key === 'Enter' || e.key === ' ') { SC.auth.openModal(); }
        };
    }

    // Guided setup relaunch from sidebar
    var onboardingBtn = document.getElementById('onboarding-btn');
    if (onboardingBtn) { onboardingBtn.onclick = SC.onboarding.show; }

    // Sidebar collapse toggle
    var sidebarToggle = document.getElementById('sidebar-toggle');
    var sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        var collapsed = localStorage.getItem('SC.sidebar_collapsed') === '1';
        if (collapsed) { sidebar.classList.add('is-collapsed'); }
        sidebarToggle.onclick = function () {
            sidebar.classList.toggle('is-collapsed');
            localStorage.setItem('SC.sidebar_collapsed', sidebar.classList.contains('is-collapsed') ? '1' : '0');
        };
    }

    // Init Supabase auth (no-op if not configured)
    SC.auth.init();
    SC.auth.updateWidget();
});
