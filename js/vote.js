'use strict';
// globals: SC, supabase, SUPABASE_URL, SUPABASE_ANON_KEY
var SC = window.SC || {};

SC.vote = {
    _myVotes: {},  // circuit_id -> current user's vote value (1, -1, or 0)

    _client: function () {
        return SC.auth.client;
    },

    loadMyVotes: function () {
        // Fetch current user's votes so buttons show active state on load
        var client = SC.vote._client();
        if (!client || !SC.auth.user) { return; }
        client
            .from('votes')
            .select('circuit_id, value')
            .eq('user_id', SC.auth.user.id)
            .then(function (result) {
                if (result.error || !result.data) { return; }
                result.data.forEach(function (row) {
                    SC.vote._myVotes[row.circuit_id] = row.value;
                });
                SC.vote._refreshAllButtons();
            });
    },

    _refreshAllButtons: function () {
        document.querySelectorAll('.vote-btn').forEach(function (btn) {
            var id  = btn.dataset.circuitId;
            var val = parseInt(btn.dataset.value, 10);
            var my  = SC.vote._myVotes[id] || 0;
            btn.classList.toggle('active', my === val);
        });
    },

    cast: function (circuitId, value, scoreEl, btnUp, btnDown) {
        // Requires sign-in
        if (!SC.auth.user) {
            SC.auth.openModal();
            return;
        }

        var client  = SC.vote._client();
        var current = SC.vote._myVotes[circuitId] || 0;
        var newVal  = (current === value) ? 0 : value;  // toggle off if same direction

        // Optimistic UI
        var oldScore = parseInt(scoreEl.textContent, 10) || 0;
        var delta    = newVal - current;
        var newScore = oldScore + delta;
        scoreEl.textContent = newScore;
        scoreEl.className   = 'vote-score' + (newScore > 0 ? ' positive' : newScore < 0 ? ' negative' : ' zero');
        SC.vote._myVotes[circuitId] = newVal;
        btnUp.classList.toggle('active',    newVal ===  1);
        btnDown.classList.toggle('active',  newVal === -1);

        var doRequest;
        if (newVal === 0) {
            // Remove vote
            doRequest = client.from('votes')
                .delete()
                .eq('circuit_id', circuitId)
                .eq('user_id', SC.auth.user.id);
        } else if (current === 0) {
            // Insert new vote
            doRequest = client.from('votes')
                .insert({ circuit_id: circuitId, user_id: SC.auth.user.id, value: newVal });
        } else {
            // Flip existing vote
            doRequest = client.from('votes')
                .update({ value: newVal })
                .eq('circuit_id', circuitId)
                .eq('user_id', SC.auth.user.id);
        }

        doRequest.then(function (result) {
            if (result.error) {
                // Rollback optimistic update
                scoreEl.textContent = oldScore;
                scoreEl.className   = 'vote-score' + (oldScore > 0 ? ' positive' : oldScore < 0 ? ' negative' : ' zero');
                SC.vote._myVotes[circuitId] = current;
                btnUp.classList.toggle('active',   current ===  1);
                btnDown.classList.toggle('active', current === -1);
                console.error('Vote error:', result.error.message);
            }
        });
    }
};
