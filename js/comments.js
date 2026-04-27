'use strict';
// globals: document, SC, supabase, SUPABASE_URL, SUPABASE_ANON_KEY
var SC = window.SC || {};

SC.comments = {
    _upvotedComments: JSON.parse(localStorage.getItem('SC.upvotedComments') || '{}'),

    open: function (circuitId, circuitName, circuitKey) {
        var overlay = document.getElementById('comments-modal-overlay');
        var title   = document.getElementById('comments-modal-title');
        var sub     = document.getElementById('comments-modal-circuit');
        if (!overlay) { return; }

        title.textContent = '💬 Comments';
        sub.textContent   = circuitName;
        overlay.classList.add('open');
        overlay.dataset.circuitId  = circuitId;
        overlay.dataset.circuitKey = circuitKey;

        SC.comments._loadAndRender(circuitId);
        SC.comments._renderPostBox(circuitId, null);
    },

    close: function () {
        var overlay = document.getElementById('comments-modal-overlay');
        if (overlay) { overlay.classList.remove('open'); }
    },

    _loadAndRender: function (circuitId) {
        var list = document.getElementById('comments-list');
        if (!list) { return; }
        list.textContent = 'Loading…';

        var client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        client
            .from('comments')
            .select('id, parent_id, user_id, body, vote_score, created_at')
            .eq('circuit_id', circuitId)
            .order('created_at', { ascending: true })
            .then(function (result) {
                list.textContent = '';
                if (result.error) {
                    list.textContent = 'Could not load comments.';
                    return;
                }
                if (!result.data || result.data.length === 0) {
                    list.innerHTML = '<div style="color:#475569;font-size:12px;text-align:center;padding:20px 0">No comments yet. Be the first!</div>';
                    SC.comments._updateCount(circuitId, 0);
                    return;
                }
                SC.comments._updateCount(circuitId, result.data.length);
                var tree = SC.comments._buildTree(result.data);
                tree.forEach(function (node) {
                    list.appendChild(SC.comments._renderNode(node, circuitId, 0));
                });
            });
    },

    _buildTree: function (rows) {
        var map = {}, roots = [], i, row;
        for (i = 0; i < rows.length; i++) {
            map[rows[i].id] = { data: rows[i], children: [] };
        }
        for (i = 0; i < rows.length; i++) {
            row = rows[i];
            if (row.parent_id && map[row.parent_id]) {
                map[row.parent_id].children.push(map[row.id]);
            } else {
                roots.push(map[row.id]);
            }
        }
        return roots;
    },

    _relativeTime: function (iso) {
        var diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (diff < 60)    { return diff + 's ago'; }
        if (diff < 3600)  { return Math.floor(diff / 60) + 'm ago'; }
        if (diff < 86400) { return Math.floor(diff / 3600) + 'h ago'; }
        return Math.floor(diff / 86400) + 'd ago';
    },

    _renderNode: function (node, circuitId, depth) {
        var data = node.data;
        var wrap = document.createElement('div');
        wrap.className = 'sc-comment';

        var meta   = document.createElement('div');
        meta.className = 'sc-comment-meta';
        var avatar = document.createElement('div');
        avatar.className = 'sc-avatar';
        avatar.textContent = (data.user_id || 'A').slice(0, 1).toUpperCase();
        var author = document.createElement('span');
        author.className = 'sc-comment-author';
        author.textContent = data.user_id ? data.user_id.slice(0, 8) + '…' : 'anon';
        var time   = document.createElement('span');
        time.className = 'sc-comment-time';
        time.textContent = SC.comments._relativeTime(data.created_at);
        meta.appendChild(avatar);
        meta.appendChild(author);
        meta.appendChild(time);
        wrap.appendChild(meta);

        var body = document.createElement('div');
        body.className = 'sc-comment-body';
        body.textContent = data.body;
        wrap.appendChild(body);

        var actions = document.createElement('div');
        actions.className = 'sc-comment-actions';
        var upBtn = document.createElement('button');
        upBtn.className = 'sc-comment-action';
        var alreadyUpvoted = !!SC.comments._upvotedComments[data.id];
        upBtn.textContent = '↑ ' + (data.vote_score || 0);
        if (alreadyUpvoted) { upBtn.style.color = '#4ade80'; }
        upBtn.onclick = function () { SC.comments._upvote(data.id, upBtn); };

        var replyBtn = document.createElement('button');
        replyBtn.className = 'sc-comment-action';
        replyBtn.textContent = '↩ Reply';
        replyBtn.onclick = function () { SC.comments._renderPostBox(circuitId, data.id, wrap); };

        actions.appendChild(upBtn);
        if (depth < 3) { actions.appendChild(replyBtn); }
        wrap.appendChild(actions);

        if (node.children.length > 0) {
            var replies = document.createElement('div');
            replies.className = 'sc-comment-replies';
            node.children.forEach(function (child) {
                replies.appendChild(SC.comments._renderNode(child, circuitId, depth + 1));
            });
            wrap.appendChild(replies);
        }

        return wrap;
    },

    _upvote: function (commentId, btn) {
        if (SC.comments._upvotedComments[commentId]) { return; }
        if (!SC.auth.user) { SC.auth.openModal(); return; }

        SC.auth.client.rpc('increment_comment_vote', { comment_id: commentId }).then(function (result) {
            if (!result.error) {
                SC.comments._upvotedComments[commentId] = 1;
                localStorage.setItem('SC.upvotedComments', JSON.stringify(SC.comments._upvotedComments));
                var current = parseInt(btn.textContent.replace('↑ ', ''), 10) || 0;
                btn.textContent = '↑ ' + (current + 1);
                btn.style.color = '#4ade80';
            }
        });
    },

    _renderPostBox: function (circuitId, parentId, insertAfter) {
        var box = document.getElementById('comments-post-box');
        if (!box) { return; }
        box.innerHTML = '';

        if (!SC.auth.user) {
            box.innerHTML = '<div class="sc-comment-signed-out">Sign in to join the discussion. <a id="comments-signin-link">Sign in →</a></div>';
            var link = document.getElementById('comments-signin-link');
            if (link) { link.onclick = function () { SC.comments.close(); SC.auth.openModal(); }; }
            return;
        }

        var wrap     = document.createElement('div');
        wrap.className = 'sc-new-comment-box';
        var textarea = document.createElement('textarea');
        textarea.className = 'sc-new-comment-input';
        textarea.placeholder = parentId ? 'Write a reply…' : 'Add a comment…';
        var footer   = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
        if (parentId) {
            var cancelReply = document.createElement('button');
            cancelReply.className = 'sc-btn-cancel';
            cancelReply.textContent = 'Cancel';
            cancelReply.onclick = function () { SC.comments._renderPostBox(circuitId, null); };
            footer.appendChild(cancelReply);
        }
        var postBtn = document.createElement('button');
        postBtn.className = 'sc-btn-primary';
        postBtn.textContent = parentId ? 'Reply →' : 'Post →';
        postBtn.onclick = function () {
            SC.comments._post(circuitId, parentId, textarea.value, postBtn);
        };
        footer.appendChild(postBtn);
        wrap.appendChild(textarea);
        wrap.appendChild(footer);
        box.appendChild(wrap);
    },

    _post: function (circuitId, parentId, body, btn) {
        body = body.trim();
        if (!body) { return; }
        if (!SC.auth.user) { SC.auth.openModal(); return; }

        btn.disabled = true;
        btn.textContent = 'Posting…';

        SC.auth.client.from('comments').insert({
            circuit_id: circuitId,
            user_id:    SC.auth.user.id,
            parent_id:  parentId || null,
            body:       body
        }).then(function (result) {
            btn.disabled = false;
            btn.textContent = parentId ? 'Reply →' : 'Post →';
            if (!result.error) {
                SC.comments._loadAndRender(circuitId);
                SC.comments._renderPostBox(circuitId, null);
            }
        });
    },

    _updateCount: function (circuitId, count) {
        document.querySelectorAll('.comment-count').forEach(function (el) {
            var btn = el.closest('button');
            if (btn && btn.onclick && btn.onclick.toString().indexOf(circuitId) !== -1) {
                el.textContent = count;
            }
        });
    },

    init: function () {
        var closeBtn = document.getElementById('comments-modal-close');
        var overlay  = document.getElementById('comments-modal-overlay');
        if (closeBtn) { closeBtn.onclick = SC.comments.close; }
        if (overlay) {
            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) { SC.comments.close(); }
            });
        }
    }
};
