// Supabase auth — magic link sign-in
"use strict";
// globals: document, window, supabase, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_CONFIGURED, SC

var SC = window.SC || {};

SC.auth = {
    client: null,
    user: null,

    init: function () {
        if (!SUPABASE_CONFIGURED) {
            return;
        }
        SC.auth.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        SC.auth.client.auth.onAuthStateChange(function (event, session) {
            var wasSignedIn = !!SC.auth.user;
            SC.auth.user = session ? session.user : null;
            SC.auth.updateWidget();
            if (event === 'SIGNED_IN' && !wasSignedIn) {
                SC.sync.onSignIn();
            }
            if (event === 'SIGNED_OUT') {
                SC.sync.updateBanner();
            }
        });

        SC.auth.client.auth.getSession().then(function (result) {
            if (result.data && result.data.session) {
                SC.auth.user = result.data.session.user;
                SC.auth.updateWidget();
            }
        });
    },

    sendMagicLink: function (email, callback) {
        if (!SC.auth.client) {
            callback({ message: 'Supabase is not configured yet. See js/config.js.' });
            return;
        }
        SC.auth.client.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: window.location.origin + window.location.pathname }
        }).then(function (result) {
            callback(result.error);
        });
    },

    signOut: function () {
        if (!SC.auth.client) { return; }
        SC.auth.client.auth.signOut();
    },

    updateWidget: function () {
        var widget = document.getElementById('auth-widget');
        if (!widget) { return; }

        if (!SUPABASE_CONFIGURED) {
            widget.style.display = 'none';
            return;
        }

        if (SC.auth.user) {
            var email = SC.auth.user.email || '';
            var initial = email.charAt(0).toUpperCase();
            widget.innerHTML =
                '<div class="auth-avatar" title="' + email + '">' + initial + '</div>' +
                '<span class="auth-email">' + email + '</span>' +
                '<button class="auth-signout-btn" id="auth-signout-btn">Sign out</button>' +
                '<span class="sync-indicator" id="sync-indicator"></span>';
            document.getElementById('auth-signout-btn').onclick = SC.auth.signOut;
        } else {
            widget.innerHTML =
                '<button class="auth-open-btn" id="auth-open-btn">Sign in to save</button>';
            document.getElementById('auth-open-btn').onclick = SC.auth.openModal;
        }

        SC.sync.updateBanner();
    },

    openModal: function () {
        var m = document.getElementById('auth-modal');
        if (m) {
            m.style.display = 'flex';
            var inp = document.getElementById('auth-email-input');
            if (inp) { setTimeout(function () { inp.focus(); }, 50); }
        }
    },

    closeModal: function () {
        var m = document.getElementById('auth-modal');
        if (m) { m.style.display = 'none'; }
        var s = document.getElementById('auth-modal-status');
        if (s) { s.textContent = ''; s.className = 'auth-status'; }
        var inp = document.getElementById('auth-email-input');
        if (inp) { inp.value = ''; }
    },

    handleModalSubmit: function () {
        var inp = document.getElementById('auth-email-input');
        var btn = document.getElementById('auth-modal-send');
        var status = document.getElementById('auth-modal-status');
        if (!inp || !btn || !status) { return; }

        var email = inp.value.trim();
        if (!email || email.indexOf('@') === -1) {
            status.textContent = 'Enter a valid email address.';
            status.className = 'auth-status error';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Sending…';
        status.textContent = '';
        status.className = 'auth-status';

        SC.auth.sendMagicLink(email, function (error) {
            btn.disabled = false;
            btn.textContent = 'Send magic link';
            if (error) {
                status.textContent = 'Error: ' + error.message;
                status.className = 'auth-status error';
            } else {
                status.textContent = '✓ Check your email for the magic link!';
                status.className = 'auth-status success';
                inp.value = '';
            }
        });
    }
};
