#!/usr/bin/env node
// One-time: scrape YouTube demo links from blogspot circuit pages, store in circuits.url_demo
//
// Run: SUPABASE_SERVICE_KEY=... node scripts/scrape_demos.js
//
// Options:
//   --dry-run   Fetch + parse but don't write to Supabase
//   --force     Re-scrape circuits that already have url_demo set

'use strict';

var supabaseJs = require('@supabase/supabase-js');

var SUPABASE_URL = 'https://jtahecdiwbqoqahogxzt.supabase.co';
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('Set SUPABASE_SERVICE_KEY env var to the service_role key');
    process.exit(1);
}

var DRY_RUN = process.argv.includes('--dry-run');
var FORCE   = process.argv.includes('--force');
var DELAY_MS = 600;

var client = supabaseJs.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ── YouTube extraction ────────────────────────────────────────────────────────

function extractYoutubeId(html) {
    var m;

    // iframe embeds — most common in Blogger posts
    var iframeRe = /(?:youtube\.com\/embed\/|youtube-nocookie\.com\/embed\/)([A-Za-z0-9_-]{11})/g;
    m = iframeRe.exec(html);
    if (m) { return m[1]; }

    // plain links (watch?v= or youtu.be/)
    var linkRe = /(?:youtube\.com\/watch\?[^"']*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/g;
    m = linkRe.exec(html);
    if (m) { return m[1]; }

    return null;
}

function youtubeUrl(id) {
    return 'https://www.youtube.com/watch?v=' + id;
}

// ── Which URL to scrape ───────────────────────────────────────────────────────

function layoutUrl(circuit) {
    return circuit.url_stripboard || circuit.url_tagboard || circuit.url_perfboard || null;
}

function isBlogspot(url) {
    return url && url.includes('blogspot.com');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
}

async function main() {
    console.log('Fetching circuits from Supabase…');

    var result = await client
        .from('circuits')
        .select('id, key, url_stripboard, url_tagboard, url_perfboard, url_demo')
        .eq('status', 'approved');

    if (result.error) {
        console.error('Fetch error:', result.error.message);
        process.exit(1);
    }

    var circuits = result.data;
    console.log('Total approved circuits:', circuits.length);

    var toProcess = circuits.filter(function (c) {
        var url = layoutUrl(c);
        if (!url) { return false; }
        if (!isBlogspot(url)) { return false; }
        if (c.url_demo && !FORCE) { return false; }
        return true;
    });

    var skipped = circuits.length - toProcess.length;
    console.log('To scrape:', toProcess.length, ' | Skipped (no URL / already done / non-blogspot):', skipped);
    if (DRY_RUN) { console.log('[DRY RUN — no writes]\n'); }

    var ok = 0, noVideo = 0, fetchFail = 0;

    for (var i = 0; i < toProcess.length; i++) {
        var circuit = toProcess[i];
        var url = layoutUrl(circuit);
        process.stdout.write('[' + (i + 1) + '/' + toProcess.length + '] ' + circuit.key + ' … ');

        var html;
        try {
            var res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml'
                },
                signal: AbortSignal.timeout(10000)
            });
            if (!res.ok) { throw new Error('HTTP ' + res.status); }
            html = await res.text();
        } catch (err) {
            console.log('FETCH_FAIL — ' + err.message);
            fetchFail++;
            await sleep(DELAY_MS);
            continue;
        }

        var ytId = extractYoutubeId(html);
        if (!ytId) {
            console.log('NO_VIDEO');
            noVideo++;
            await sleep(DELAY_MS);
            continue;
        }

        var demoUrl = youtubeUrl(ytId);

        if (!DRY_RUN) {
            var upd = await client
                .from('circuits')
                .update({ url_demo: demoUrl })
                .eq('id', circuit.id);

            if (upd.error) {
                console.log('UPDATE_FAIL — ' + upd.error.message);
                fetchFail++;
                await sleep(DELAY_MS);
                continue;
            }
        }

        console.log('OK → ' + demoUrl);
        ok++;
        await sleep(DELAY_MS);
    }

    console.log('\n── Summary ─────────────────────────────');
    console.log('  Updated:      ' + ok);
    console.log('  No video:     ' + noVideo);
    console.log('  Fetch errors: ' + fetchFail);
    if (DRY_RUN) { console.log('  (Dry run — nothing written)'); }
}

main().catch(function (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
});
