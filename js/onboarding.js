// Guided onboarding journey — step through each part category
"use strict";
// globals: document, window, SC, CA

var SC = window.SC || {};

SC.onboarding = (function () {
    var STEP_ORDER = ['resistor', 'capacitor', 'transistor', 'diode', 'chip', 'pot', 'pot_trimmer', 'switch', 'inductor', 'ldr', 'connector', 'tube', 'supply', 'other'];
    var STEP_LABELS = {
        resistor:    'Resistors',
        capacitor:   'Capacitors',
        transistor:  'Transistors',
        diode:       'Diodes',
        chip:        'Chips / ICs',
        pot:         'Potentiometers',
        pot_trimmer: 'Trimmers',
        switch:      'Switches',
        inductor:    'Inductors',
        ldr:         'LDRs',
        connector:   'Connectors',
        tube:        'Tubes',
        supply:      'Power Supply',
        other:       'Other Parts'
    };
    var STEP_ICONS = {
        resistor: 'Ω', capacitor: 'C', transistor: 'T', diode: '▷', chip: '◫',
        pot: '⊕', pot_trimmer: '⊕', switch: '⏻', inductor: '∿', ldr: '◑',
        connector: '⌥', tube: '◎', supply: '⚡', other: '·'
    };
    var ENG_TYPES = { resistor: 1, capacitor: 1, pot: 1, pot_trimmer: 1 };

    var steps = [];
    var currentStep = 0;
    var sortMode = 'alpha';
    var freq = null;
    var overlay = null;

    function computeFreq() {
        var f = {}, k, n, t, vals, v;
        for (k in SC.circuit) {
            if (!SC.circuit.hasOwnProperty(k)) { continue; }
            for (n in SC.circuit[k].parts) {
                if (!SC.circuit[k].parts.hasOwnProperty(n)) { continue; }
                t = SC.nameToType(n, k);
                vals = Array.isArray(SC.circuit[k].parts[n]) ? SC.circuit[k].parts[n] : [SC.circuit[k].parts[n]];
                for (v = 0; v < vals.length; v++) {
                    f[t] = f[t] || {};
                    f[t][vals[v]] = (f[t][vals[v]] || 0) + 1;
                }
            }
        }
        return f;
    }

    function getActiveSteps() {
        return STEP_ORDER.filter(function (t) {
            return SC.values[t] && Object.keys(SC.values[t]).length > 0;
        });
    }

    function getSortedParts(type) {
        var vals = SC.values[type];
        if (!vals) { return []; }
        var useEng = !!ENG_TYPES[type];
        var parts = Object.keys(vals).map(function (v) {
            return { value: v, freq: (freq[type] && freq[type][v]) || 0 };
        });
        if (sortMode === 'freq') {
            parts.sort(function (a, b) {
                if (b.freq !== a.freq) { return b.freq - a.freq; }
                var av = useEng ? SC.fromEng(a.value.replace(' Stereo', '')) : a.value;
                var bv = useEng ? SC.fromEng(b.value.replace(' Stereo', '')) : b.value;
                return av < bv ? -1 : av > bv ? 1 : 0;
            });
        } else {
            parts.sort(function (a, b) {
                var av = useEng ? SC.fromEng(a.value.replace(' Stereo', '')) : a.value;
                var bv = useEng ? SC.fromEng(b.value.replace(' Stereo', '')) : b.value;
                return av < bv ? -1 : av > bv ? 1 : 0;
            });
        }
        return parts;
    }

    function updateProgress() {
        var pct = steps.length > 1 ? (currentStep / (steps.length - 1)) * 100 : 100;
        var bar = overlay.querySelector('.ob-progress-fill');
        if (bar) { bar.style.width = pct + '%'; }
        overlay.querySelector('.ob-step-num').textContent = (currentStep + 1) + ' / ' + steps.length;
    }

    function renderStep() {
        var type = steps[currentStep];
        var parts = getSortedParts(type);

        overlay.querySelector('.ob-icon').textContent = STEP_ICONS[type] || '·';
        overlay.querySelector('.ob-category').textContent = STEP_LABELS[type] || type;
        updateProgress();

        overlay.querySelectorAll('.ob-sort-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-sort') === sortMode);
        });

        var sortLabel = overlay.querySelector('.ob-sort-active-label');
        if (sortLabel) {
            sortLabel.textContent = sortMode === 'alpha' ? 'A → Z' : 'most used first';
        }

        var grid = overlay.querySelector('.ob-parts-grid');
        grid.innerHTML = '';

        parts.forEach(function (p) {
            var row = document.createElement('label');
            row.className = 'ob-part-row';

            var nameEl = document.createElement('span');
            nameEl.className = 'ob-part-name';
            nameEl.textContent = p.value;

            var freqEl = document.createElement('span');
            freqEl.className = 'ob-part-freq';
            if (p.freq > 0) {
                freqEl.textContent = '×' + p.freq;
                freqEl.title = 'Used in ' + p.freq + ' circuit' + (p.freq !== 1 ? 's' : '');
            }

            var input = document.createElement('input');
            input.type = 'number';
            input.min = 0;
            input.max = 999;
            input.step = 10;
            input.placeholder = '0';
            var stored = SC.counts[type] && SC.counts[type][p.value];
            input.value = stored ? stored : '';

            input.addEventListener('input', (function (ptype, pvalue) {
                return function () {
                    SC.counts[ptype] = SC.counts[ptype] || {};
                    var n = parseInt(input.value, 10);
                    SC.counts[ptype][pvalue] = isNaN(n) ? 0 : n;
                    if (SC.values[ptype] && SC.values[ptype][pvalue]) {
                        SC.values[ptype][pvalue].input.value = input.value;
                    }
                    CA.storage.writeObject('SC.counts', SC.counts);
                    SC.sync.schedule && SC.sync.schedule();
                };
            }(type, p.value)));

            row.appendChild(nameEl);
            row.appendChild(freqEl);
            row.appendChild(input);
            grid.appendChild(row);
        });

        overlay.querySelector('.ob-grid-wrap').scrollTop = 0;

        var backBtn = overlay.querySelector('.ob-back-btn');
        if (backBtn) { backBtn.style.display = currentStep === 0 ? 'none' : ''; }

        var nextBtn = overlay.querySelector('.ob-next-btn');
        if (currentStep >= steps.length - 1) {
            nextBtn.textContent = 'FINISH ✓';
            nextBtn.classList.add('is-finish');
        } else {
            nextBtn.textContent = 'NEXT →';
            nextBtn.classList.remove('is-finish');
        }
    }

    function fillTen() {
        var type = steps[currentStep];
        var inputs = overlay.querySelectorAll('.ob-part-row input[type=number]');
        var parts = getSortedParts(type);
        inputs.forEach(function (inp, i) {
            if (!parts[i]) { return; }
            inp.value = 10;
            SC.counts[type] = SC.counts[type] || {};
            SC.counts[type][parts[i].value] = 10;
            if (SC.values[type] && SC.values[type][parts[i].value]) {
                SC.values[type][parts[i].value].input.value = 10;
            }
        });
        CA.storage.writeObject('SC.counts', SC.counts);
        SC.sync.schedule && SC.sync.schedule();
    }

    function prev() {
        if (currentStep > 0) {
            currentStep--;
            renderStep();
        }
    }

    function next() {
        if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
        }
    }

    function finish() {
        overlay.style.display = 'none';
        SC.dismissWelcome();
        SC.refresh();
        SC.updateSidebarCounts();
        SC.sync.updateBanner && SC.sync.updateBanner();
    }

    function show() {
        overlay = overlay || document.getElementById('onboarding-overlay');
        freq = computeFreq();
        steps = getActiveSteps();
        currentStep = 0;
        sortMode = 'alpha';

        if (!steps.length) { finish(); return; }

        overlay.style.display = 'flex';
        renderStep();

        overlay.querySelectorAll('.ob-sort-btn').forEach(function (btn) {
            btn.onclick = function () {
                sortMode = btn.getAttribute('data-sort');
                renderStep();
            };
        });

        overlay.querySelector('.ob-skip-btn').onclick = function () {
            if (currentStep >= steps.length - 1) { finish(); } else { next(); }
        };

        overlay.querySelector('.ob-back-btn').onclick = prev;

        var fillBtn = overlay.querySelector('#ob-fill-ten');
        if (fillBtn) { fillBtn.onclick = fillTen; }

        overlay.querySelector('.ob-next-btn').onclick = function () {
            if (currentStep >= steps.length - 1) { finish(); } else { next(); }
        };
    }

    return { show: show };
}());
