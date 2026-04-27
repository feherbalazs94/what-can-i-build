#!/usr/bin/env node
// One-time seed: reads all circuit/*.json files, inserts into Supabase circuits table
// Run: node scripts/seed_circuits.js
// Requires: npm install @supabase/supabase-js (run once in scripts/ or project root)

'use strict';

var fs = require('fs');
var path = require('path');
var supabaseJs = require('@supabase/supabase-js');

var SUPABASE_URL = 'https://jtahecdiwbqoqahogxzt.supabase.co';
// Use service_role key (not anon key) to bypass RLS for the seed insert.
// Find it in Supabase Dashboard → Settings → API → service_role key.
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_KEY env var to the service_role key');
    process.exit(1);
}

var client = supabaseJs.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

var circuitDir = path.join(__dirname, '..', 'circuit');
var files = fs.readdirSync(circuitDir).filter(function (f) {
    return f.endsWith('.json');
});

var rows = files.map(function (filename) {
    var key = filename.replace('.json', '');
    var data = JSON.parse(fs.readFileSync(path.join(circuitDir, filename), 'utf8'));
    var url = data.url || {};
    return {
        key: key,
        name: data.name,
        author: data.author || null,
        url_schematic:  url.schematic  || null,
        url_stripboard: url.stripboard || null,
        url_perfboard:  url.perfboard  || null,
        url_pcb:        url.pcb        || null,
        url_tagboard:   url.tagboard   || null,
        url_pedal:      url.pedal      || null,
        url_demo:       null,
        parts:          data.parts || {},
        status:         'approved',
        submitted_by:   null
    };
});

console.log('Seeding', rows.length, 'circuits...');

// Insert in batches of 100 to avoid request size limits
var BATCH = 100;
var promises = [];
for (var i = 0; i < rows.length; i += BATCH) {
    promises.push(
        client.from('circuits').upsert(rows.slice(i, i + BATCH), { onConflict: 'key' })
    );
}

Promise.all(promises).then(function (results) {
    var errors = results.filter(function (r) { return r.error; });
    if (errors.length > 0) {
        console.error('Errors:', errors.map(function (r) { return r.error.message; }));
        process.exit(1);
    }
    console.log('Done — seeded', rows.length, 'circuits.');
}).catch(function (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
});
