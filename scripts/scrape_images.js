#!/usr/bin/env node
// One-time: scrape layout image URLs from blogspot circuit pages, store in circuits.url_image
//
// Prerequisites:
//   1. Run this SQL in Supabase Dashboard → SQL Editor:
//      ALTER TABLE circuits ADD COLUMN IF NOT EXISTS url_image text;
//
//   2. Run the script:
//      SUPABASE_SERVICE_KEY=... node scripts/scrape_images.js
//
//   Options:
//      --dry-run   Fetch + parse but don't write to Supabase
//      --force     Re-scrape circuits that already have url_image set

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
var DELAY_MS = 600; // ms between requests — be polite to blogspot

var client = supabaseJs.createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// ── Image extraction ──────────────────────────────────────────────────────────

// Blogger image CDN patterns:
//   - blogger.googleusercontent.com  (current Blogger CDN, most common)
//   - N.bp.blogspot.com              (older Blogger CDN)
//   - lh*.googleusercontent.com      (Google Photos / older Blogger)
var BLOGGER_CDN_RE = /(?:blogger\.googleusercontent\.com|lh\d+\.googleusercontent\.com|\d+\.bp\.blogspot\.com)/;

function extractImageUrl(html) {
    // Strategy 1: grab the full-size URL from the <a href> wrapping the layout image.
    // Blogger wraps thumbnails in <a href="...s1600/..."><img src="...s320/..."></a>
    var aHrefRe = /href="(https?:\/\/(?:blogger\.googleusercontent\.com|lh\d+\.googleusercontent\.com|\d+\.bp\.blogspot\.com)\/[^"]+\/s1600\/[^"]+)"/gi;
    var m = aHrefRe.exec(html);
    if (m) { return m[1]; }

    // Strategy 2: fall back to any <img src> on the Blogger CDN and upgrade to full size.
    var imgSrcRe = /src="(https?:\/\/(?:blogger\.googleusercontent\.com|lh\d+\.googleusercontent\.com|\d+\.bp\.blogspot\.com)\/[^"]+)"/gi;
    var best = null, bestSize = 0;
    while ((m = imgSrcRe.exec(html)) !== null) {
        var url = m[1];
        var sizeMatch = url.match(/\/s(\d+)\//);
        var size = sizeMatch ? parseInt(sizeMatch[1], 10) : 9999;
        if (size < 80) { continue; } // skip icons
        if (!best || size > bestSize) { best = url; bestSize = size; }
    }
    if (best) {
        return best.replace(/\/s\d+\//, '/s0/').replace(/=w\d+-h\d+.*$/, '');
    }

    return null;
}

// ── Decide which URL to scrape for each circuit ───────────────────────────────

function layoutUrl(circuit) {
    // Priority: stripboard > tagboard > perfboard (all are layout images)
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
        .select('id, key, url_stripboard, url_tagboard, url_perfboard, url_image')
        .eq('status', 'approved');

    if (result.error) {
        console.error('Fetch error:', result.error.message);
        process.exit(1);
    }

    var circuits = result.data;
    console.log('Total approved circuits:', circuits.length);

    var toProcess = circuits.filter(function (c) {
        var url = layoutUrl(c);
        if (!url) return false;                      // no layout URL at all
        if (!isBlogspot(url)) return false;          // only handle blogspot for now
        if (c.url_image && !FORCE) return false;     // already scraped, skip unless --force
        return true;
    });

    var skipped = circuits.length - toProcess.length;
    console.log('To scrape:', toProcess.length, ' | Skipped (no URL / already done / non-blogspot):', skipped);
    if (DRY_RUN) console.log('[DRY RUN — no writes]\n');

    var ok = 0, noImage = 0, fetchFail = 0;

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
            if (!res.ok) throw new Error('HTTP ' + res.status);
            html = await res.text();
        } catch (err) {
            console.log('FETCH_FAIL — ' + err.message);
            fetchFail++;
            await sleep(DELAY_MS);
            continue;
        }

        var imageUrl = extractImageUrl(html);
        if (!imageUrl) {
            console.log('NO_IMAGE');
            noImage++;
            await sleep(DELAY_MS);
            continue;
        }

        if (!DRY_RUN) {
            var upd = await client
                .from('circuits')
                .update({ url_image: imageUrl })
                .eq('id', circuit.id);

            if (upd.error) {
                console.log('UPDATE_FAIL — ' + upd.error.message);
                fetchFail++;
                await sleep(DELAY_MS);
                continue;
            }
        }

        console.log('OK → ' + imageUrl.slice(0, 72) + (imageUrl.length > 72 ? '…' : ''));
        ok++;
        await sleep(DELAY_MS);
    }

    console.log('\n── Summary ─────────────────────────────');
    console.log('  Updated:      ' + ok);
    console.log('  No image:     ' + noImage);
    console.log('  Fetch errors: ' + fetchFail);
    if (DRY_RUN) console.log('  (Dry run — nothing written)');
}

main().catch(function (err) {
    console.error('Fatal:', err.message);
    process.exit(1);
});
