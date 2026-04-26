// Deep-link: open a specific circuit via ?circuit=key or referrer URL match
"use strict";
// globals: document, window, SC

var SC = window.SC || {};

SC.deepLink = (function () {

    function normalizeUrl(u) {
        // Strip trailing slash and fragment for comparison
        return u.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
    }

    function findCircuitByUrl(url) {
        // Return circuit key whose stored URLs include the given URL
        var norm = normalizeUrl(url);
        var k, type;
        for (k in SC.circuit) {
            if (!SC.circuit.hasOwnProperty(k)) { continue; }
            for (type in SC.circuit[k].url) {
                if (!SC.circuit[k].url.hasOwnProperty(type)) { continue; }
                var stored = SC.circuit[k].url[type];
                if (stored && normalizeUrl(stored) === norm) {
                    return k;
                }
            }
        }
        return null;
    }

    function findCircuitByKey(key) {
        return SC.circuit.hasOwnProperty(key) ? key : null;
    }

    function findRow(key) {
        // Look in both tables for a row whose circuit key matches
        var tables = [
            document.getElementById('table_ok'),
            document.getElementById('table_almost')
        ];
        var i, rows, r;
        for (i = 0; i < tables.length; i++) {
            if (!tables[i]) { continue; }
            rows = tables[i].querySelectorAll('tr');
            for (r = 0; r < rows.length; r++) {
                if (rows[r].dataset.circuitKey === key) {
                    return rows[r];
                }
            }
        }
        return null;
    }

    function showBanner(circuit, source) {
        var banner = document.getElementById('deeplink-banner');
        if (!banner) { return; }
        var nameEl = banner.querySelector('.dl-name');
        var sourceEl = banner.querySelector('.dl-source');
        if (nameEl) { nameEl.textContent = circuit.name; }
        if (sourceEl) {
            if (source === 'param') {
                sourceEl.textContent = 'linked directly';
            } else {
                try {
                    sourceEl.textContent = new URL(source).hostname.replace('www.', '');
                } catch (e) {
                    sourceEl.textContent = 'external link';
                }
            }
        }
        banner.style.display = 'flex';
        banner.querySelector('.dl-close').onclick = function () {
            banner.style.display = 'none';
        };
    }

    function highlightRow(row) {
        row.classList.add('is-highlighted');
        // Scroll the row into view smoothly
        setTimeout(function () {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
        // Fade out highlight after 4s
        setTimeout(function () {
            row.classList.add('highlight-fade');
        }, 4000);
    }

    function resolve() {
        // 1. Check ?circuit=key URL param
        var params = new URLSearchParams(window.location.search);
        var paramKey = params.get('circuit');
        var key = null;
        var source = null;

        if (paramKey) {
            key = findCircuitByKey(paramKey);
            source = 'param';
        }

        // 2. Fall back to referrer matching
        if (!key && document.referrer) {
            key = findCircuitByUrl(document.referrer);
            source = document.referrer;
        }

        if (!key) { return; }

        var circuit = SC.circuit[key];
        if (!circuit) { return; }

        // Wait for SC.refresh() to have rendered the rows
        var attempts = 0;
        function tryHighlight() {
            var row = findRow(key);
            if (row) {
                highlightRow(row);
                showBanner(circuit, source);
            } else if (attempts < 20) {
                attempts++;
                setTimeout(tryHighlight, 100);
            }
        }
        tryHighlight();
    }

    return { resolve: resolve };
}());
