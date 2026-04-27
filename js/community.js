// Load approved circuits from Supabase, replacing the old circuits.js global
"use strict";
// globals: supabase, SUPABASE_URL, SUPABASE_ANON_KEY

var SC = window.SC || {};

SC.loadCircuits = function () {
    // Returns a Promise that resolves when SC.circuit is populated.
    // Uses a fresh anon client so this can be called before auth.init().
    var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    SC.circuit = SC.circuit || {};

    return client
        .from('circuits')
        .select('id, key, name, author, url_schematic, url_stripboard, url_perfboard, url_pcb, url_tagboard, url_pedal, url_demo, parts, status, submitted_by, vote_score')
        .eq('status', 'approved')
        .then(function (result) {
            if (result.error) {
                console.error('loadCircuits error:', result.error.message);
                return;
            }
            SC.circuit = {};
            (result.data || []).forEach(function (row) {
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
        });
};
