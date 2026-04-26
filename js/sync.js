// Supabase sync — push/pull parts inventory
"use strict";
// globals: document, window, SC, CA

var SC = window.SC || {};

SC.sync = {
    _pushTimer: null,

    hasAnyParts: function () {
        var t;
        for (t in SC.counts) {
            if (SC.counts.hasOwnProperty(t) && t !== 'supply') {
                return true;
            }
        }
        return false;
    },

    schedule: function () {
        clearTimeout(SC.sync._pushTimer);
        SC.sync._pushTimer = setTimeout(SC.sync.push, 1200);
    },

    push: function () {
        if (!SC.auth.client || !SC.auth.user) { return; }
        SC.sync.setIndicator('saving');
        SC.auth.client
            .from('user_parts')
            .upsert(
                { user_id: SC.auth.user.id, counts: SC.counts, done: SC.done },
                { onConflict: 'user_id' }
            )
            .then(function (result) {
                if (result.error) {
                    SC.sync.setIndicator('error');
                } else {
                    SC.sync.setIndicator('saved');
                }
            });
    },

    pull: function (callback) {
        if (!SC.auth.client || !SC.auth.user) { return; }
        SC.auth.client
            .from('user_parts')
            .select('counts, done')
            .eq('user_id', SC.auth.user.id)
            .maybeSingle()
            .then(function (result) {
                if (result.data) {
                    SC.counts = result.data.counts || SC.counts;
                    SC.done   = result.data.done   || SC.done;
                    CA.storage.writeObject('SC.counts', SC.counts);
                    CA.storage.writeObject('SC.done',   SC.done);
                    SC.sync.refreshInputs();
                    SC.refresh();
                }
                if (callback) { callback(!!result.data); }
            });
    },

    onSignIn: function () {
        SC.sync.pull(function (hadCloudData) {
            if (!hadCloudData && SC.sync.hasAnyParts()) {
                SC.sync.push();
            }
        });
    },

    refreshInputs: function () {
        var t, v, inp;
        for (t in SC.values) {
            if (SC.values.hasOwnProperty(t)) {
                for (v in SC.values[t]) {
                    if (SC.values[t].hasOwnProperty(v)) {
                        inp = SC.values[t][v].input;
                        inp.value = (SC.counts[t] && SC.counts[t][v]) || '';
                    }
                }
            }
        }
    },

    setIndicator: function (state) {
        var el = document.getElementById('sync-indicator');
        if (!el) { return; }
        if (state === 'saving') {
            el.textContent = '↑ Saving…';
            el.className = 'sync-indicator saving';
        } else if (state === 'saved') {
            el.textContent = '✓ Saved';
            el.className = 'sync-indicator saved';
            setTimeout(function () {
                el.textContent = '';
                el.className = 'sync-indicator';
            }, 2500);
        } else if (state === 'error') {
            el.textContent = '⚠ Sync failed';
            el.className = 'sync-indicator error';
        }
    },

    updateBanner: function () {
        var banner = document.getElementById('sync-banner');
        if (!banner) { return; }
        var show = SUPABASE_CONFIGURED && !SC.auth.user && SC.sync.hasAnyParts();
        banner.style.display = show ? 'flex' : 'none';
    }
};
