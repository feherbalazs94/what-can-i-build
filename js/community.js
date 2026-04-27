'use strict';
// globals: supabase, SUPABASE_URL, SUPABASE_ANON_KEY

var SC = window.SC || {};

var _CIRCUIT_CACHE_KEY = 'SC.circuitsCache';
var _CIRCUIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

SC._parseCircuitRows = function (rows) {
    SC.circuit = {};
    (rows || []).forEach(function (row) {
        SC.circuit[row.key] = {
            id:           row.id,
            key:          row.key,
            name:         row.name,
            author:       row.author || '',
            submitted_by: row.submitted_by,
            vote_score:   row.vote_score || 0,
            url: {
                schematic:  row.url_schematic  || '',
                stripboard: row.url_stripboard || '',
                perfboard:  row.url_perfboard  || '',
                pcb:        row.url_pcb        || '',
                tagboard:   row.url_tagboard   || '',
                pedal:      row.url_pedal      || '',
                demo:       row.url_demo       || ''
            },
            parts: row.parts || {}
        };
    });
};

SC._fetchAndCacheCircuits = function (client) {
    return client
        .from('circuits')
        .select('id, key, name, author, url_schematic, url_stripboard, url_perfboard, url_pcb, url_tagboard, url_pedal, url_demo, parts, status, submitted_by, vote_score')
        .eq('status', 'approved')
        .then(function (result) {
            if (result.error) {
                console.error('loadCircuits error:', result.error.message);
                return;
            }
            SC._parseCircuitRows(result.data);
            try {
                localStorage.setItem(_CIRCUIT_CACHE_KEY, JSON.stringify({
                    ts:   Date.now(),
                    rows: result.data
                }));
            } catch (e) { /* storage full — just skip caching */ }
        });
};

SC.loadCircuits = function () {
    // Serve from localStorage if cache is fresh, then revalidate in background.
    var cached;
    try {
        cached = JSON.parse(localStorage.getItem(_CIRCUIT_CACHE_KEY) || 'null');
    } catch (e) { cached = null; }

    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    if (cached && (Date.now() - cached.ts) < _CIRCUIT_CACHE_TTL) {
        // Cache hit — populate immediately, refresh in background
        SC._parseCircuitRows(cached.rows);
        SC._fetchAndCacheCircuits(client); // background refresh, don't await
        return Promise.resolve();
    }

    // Cache miss or stale — fetch synchronously (user waits once)
    return SC._fetchAndCacheCircuits(client);
};

SC.clearCircuitCache = function () {
    localStorage.removeItem(_CIRCUIT_CACHE_KEY);
};
