// ---------------------------------------------------------------------------
// ui-forum.js — the Forum tab. Discord-inspired: a channel sidebar, threads
// as posts-with-replies, emoji reactions, lightweight markdown, @mentions,
// and admin pin/delete. Reading is public; creating/replying needs an
// account (see forum.js's API client + server/src/routes/forum.js).
//
// Deliberately NOT part of the app's usual "full re-render on every
// State.notify()" pattern (see CLAUDE.md) — this tab's content comes from
// the server, not State.data, and a blind full rebuild on every unrelated
// state change would both hammer the API and wipe an in-progress reply
// draft. Instead it mounts once, then only re-fetches on explicit
// navigation/actions or its own refresh-based poll timer (chosen over
// WebSockets — see CLAUDE.md "Forum" for why).
// ---------------------------------------------------------------------------

const FORUM_EMOJI = ['👍', '👎', '❤️', '😂', '🎉', '😮', '😢', '🔥'];
const FORUM_POLL_MS = 20000;

function fmtForumTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString()} ${time}`;
}

// Highlights @DisplayName tokens against the real known-members list rather
// than guessing from a bare regex — display names can contain spaces, so
// this matches against actual names (longest first, so "@Bob" can't eat
// into a match for "@Bobby Jones") instead of trying to parse word
// boundaries. Runs on already-escaped HTML, wrapping matches in a safe span.
function renderForumMentions(escapedHtml, members) {
  if (!members || !members.length) return escapedHtml;
  // One combined alternation, longest name first, in a SINGLE replace pass —
  // not N sequential per-name replaces. Sequential passes have a real bug:
  // after wrapping "@Bobby Jones", a later pass for the shorter name "Bob"
  // would match again *inside* the text the first pass already wrapped
  // (its rendered text still literally starts with "@Bob"), nesting a
  // second mention span inside the first. A single alternation regex
  // consumes the longest match at each position and advances past it, so
  // a shorter name's pattern never gets a chance to re-scan already-matched
  // text.
  const names = [...members].map(m => escapeHtml(m.displayName || '')).filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!names.length) return escapedHtml;
  const pattern = new RegExp('@(?:' + names.join('|') + ')', 'g');
  return escapedHtml.replace(pattern, (m) => `<span class="fm-mention">${m}</span>`);
}

// Only this app's OWN already-hosted game art may be embedded as an image —
// never an arbitrary external URL. This is a public forum anyone can post
// to once signed in, so a bare user-typed image URL would be a real
// hotlinking/content-safety risk (tracking pixels, inappropriate external
// images); restricting to a known-safe same-site asset path avoids that
// entirely while still covering the actual use case (referencing one of
// this app's own extracted monster/weapon/hero/item portraits).
function isSafeForumImagePath(src) {
  const clean = src.replace(/^https:\/\/yo-repo87\.github\.io\/xp-hero-builder\//, '');
  return /^assets\/img\/[a-zA-Z0-9_\-]+\/[a-zA-Z0-9_\- ]+\.(png|jpg|jpeg|gif|webp)$/i.test(clean) ? clean : null;
}

// A small, regex-based subset of Discord's own lightweight markdown — not a
// full CommonMark parser (this app has no build step to pull one in, and
// forum posts don't need tables/nested lists). Input is HTML-escaped
// FIRST, so every transform below only ever wraps already-safe text in a
// known-safe tag; no HTML a user types can reach the page unescaped.
function renderForumMarkdown(raw, members) {
  let s = escapeHtml(raw || '');
  s = renderForumMentions(s, members);

  // Images are extracted FIRST and protected behind opaque placeholder
  // tokens — real monster/item icon filenames are full of underscores
  // (e.g. Face_CH2_Goblin_Unique.png), which the italic-underscore rule
  // below would otherwise mangle (matching "_CH2_" as italic) before the
  // image syntax ever got a chance to match the whole path. The
  // placeholder keeps the finished <img> tag safe from every later
  // formatting pass, then gets swapped back in at the very end.
  const imgPlaceholders = [];
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (full, alt, src) => {
    const safeSrc = isSafeForumImagePath(src);
    if (!safeSrc) return full;
    const token = `\u0000IMG${imgPlaceholders.length}\u0000`;
    imgPlaceholders.push(`<img class="fm-post-image" src="${safeSrc}" alt="${alt}" loading="lazy" onerror="this.remove()">`);
    return token;
  });

  s = s.replace(/```([\s\S]+?)```/g, (_, code) => `<pre class="fm-codeblock">${code}</pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code class="fm-code">$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  s = s.replace(/^&gt; ?(.*)$/gm, '<span class="fm-quote">▌ $1</span>');
  s = s.replace(/\n/g, '<br>');

  s = s.replace(/\u0000IMG(\d+)\u0000/g, (_, i) => imgPlaceholders[Number(i)]);
  return s;
}

// Wires a textarea's own "@" trigger to a dropdown of real forum members —
// shared by the new-thread modal and the reply composer. mousedown (not
// click) on an option so it fires before the textarea's blur would hide
// the dropdown first.
function wireMentionAutocomplete(textareaId, dropdownId, getMembers) {
  const ta = document.getElementById(textareaId);
  const dd = document.getElementById(dropdownId);
  if (!ta || !dd) return;
  function update() {
    const pos = ta.selectionStart;
    const text = ta.value.slice(0, pos);
    const at = text.lastIndexOf('@');
    if (at === -1 || text.slice(at + 1).includes('\n')) { dd.hidden = true; return; }
    const query = text.slice(at + 1).toLowerCase();
    const matches = (getMembers() || []).filter(m => m.displayName.toLowerCase().includes(query)).slice(0, 6);
    if (!matches.length) { dd.hidden = true; return; }
    dd.hidden = false;
    dd.innerHTML = matches.map(m => `<div class="fm-mention-option" data-name="${escapeHtml(m.displayName)}">${avatarHTML(m)}<span>${escapeHtml(m.displayName)}</span></div>`).join('');
    dd.querySelectorAll('.fm-mention-option').forEach(opt => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const name = opt.dataset.name;
        ta.value = ta.value.slice(0, at) + '@' + name + ' ' + ta.value.slice(pos);
        dd.hidden = true;
        ta.focus();
        const newPos = at + name.length + 2;
        ta.setSelectionRange(newPos, newPos);
      });
    });
  }
  ta.addEventListener('input', update);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') dd.hidden = true; });
  ta.addEventListener('blur', () => setTimeout(() => { dd.hidden = true; }, 150));
}

// Tracks unread @mention count and paints a small badge on the Forum nav
// tab (both the desktop pill and the mobile bottom-bar copy) so a mention
// is visible from any tab, not just while already looking at the Forum.
// Checked once per sign-in/out transition (via Auth.subscribe, wired in
// ForumUI.init() below) — no separate polling loop of its own; the Forum
// tab's own 20s poll already covers "while you're actively looking at the
// forum," and this is just the "did something happen while I was
// elsewhere" signal, which only needs to be fresh as of the last auth
// change or an explicit refresh() call (e.g. after opening the panel).
const ForumMentions = {
  unreadCount: 0,
  mentions: [],

  async refresh() {
    if (!Auth.user) { this.unreadCount = 0; this.mentions = []; this._paint(); return; }
    try {
      const { mentions, unreadCount } = await Forum.getMentions();
      this.mentions = mentions;
      this.unreadCount = unreadCount;
    } catch { /* silent — badge just stays at its last known value */ }
    this._paint();
  },

  _paint() {
    document.querySelectorAll('.tab-btn[data-tab="forum"]').forEach(btn => {
      let badge = btn.querySelector('.fm-tab-badge');
      if (this.unreadCount > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'fm-tab-badge'; btn.appendChild(badge); }
        badge.textContent = this.unreadCount > 9 ? '9+' : String(this.unreadCount);
      } else if (badge) {
        badge.remove();
      }
    });
    this._paintBanner();
  },

  // Separate from _paint() so _renderShell() (js/ui-forum.js's ForumUI) can
  // re-sync this one element to whatever count is already known right after
  // rebuilding the Forum tab's shell, without needing a full ForumMentions
  // refresh (which would re-hit the API every time the shell re-renders).
  _paintBanner() {
    const row = document.getElementById('fm-mentions-banner-row');
    if (!row) return;
    if (!Auth.user || this.unreadCount <= 0) { row.hidden = true; return; }
    row.hidden = false;
    row.innerHTML = `🔔 You have ${this.unreadCount} new mention${this.unreadCount === 1 ? '' : 's'}. <button class="btn btn-sm btn-gold" id="fm-view-mentions">View</button>`;
    document.getElementById('fm-view-mentions').addEventListener('click', () => this.openPanel());
  },

  async openPanel() {
    UI.openModal(`
      <div class="modal-header"><h3>🔔 Mentions</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body" id="fm-mentions-list"><div class="fm-loading">Loading…</div></div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    const list = document.getElementById('fm-mentions-list');
    try {
      const { mentions } = await Forum.getMentions();
      list.innerHTML = mentions.length
        ? mentions.map(m => `
          <div class="fm-mention-row" data-thread="${m.threadId}">
            <div class="fm-mention-meta">${escapeHtml(m.author.displayName)} mentioned you · ${fmtForumTime(m.createdAt)}</div>
            <div class="fm-mention-title">${escapeHtml(m.threadTitle)}</div>
            <div class="fm-mention-snippet">${escapeHtml(m.snippet)}</div>
          </div>`).join('')
        : `<div class="empty-state" style="padding:20px">No mentions yet.</div>`;
      list.querySelectorAll('[data-thread]').forEach(row => {
        row.addEventListener('click', () => {
          UI.closeModal();
          State.setTab('forum');
          ForumUI.openThread(row.dataset.thread);
        });
      });
    } catch (err) {
      list.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
    // Opening the panel marks everything as read — the badge clears once
    // the list has been SEEN, matching how most apps' notification bell
    // behaves; no per-item read-tracking, kept deliberately simple.
    if (this.unreadCount > 0) {
      try { await Forum.markMentionsRead(); } catch { /* best effort */ }
      this.unreadCount = 0;
      this._paint();
    }
  },
};

const ForumUI = {
  channels: [],
  members: [],
  activeChannelId: null,
  activeThreadId: null,
  _mounted: false,
  _pollTimer: null,
  _lastKnownReplyCount: null,

  init() {
    Auth.subscribe(() => this._onAuthChange());
    Auth.subscribe(() => ForumMentions.refresh());
  },

  render() {
    if (!this._mounted) { this._mounted = true; this._boot(); }
    this._syncPolling();
  },

  async _boot() {
    const root = document.getElementById('forum-root');
    try {
      this.channels = await Forum.listChannels();
    } catch (err) {
      root.innerHTML = `<div class="empty-state"><div class="es-icon">💬</div>Couldn't reach the forum backend right now.<br><span class="fs-sub">${escapeHtml(err.message)}</span></div>`;
      return;
    }
    Forum.listMembers().then(m => { this.members = m; });
    this._renderShell();
    this.activeChannelId = this.channels[0]?.id || null;
    if (this.activeChannelId) this.openChannel(this.activeChannelId);
  },

  _onAuthChange() {
    if (!this._mounted) return;
    this._renderShell();
    if (this.activeThreadId) this.openThread(this.activeThreadId);
    else if (this.activeChannelId) this.openChannel(this.activeChannelId);
  },

  _syncPolling() {
    const visible = State.data.ui.activeTab === 'forum';
    if (visible && !this._pollTimer) this._pollTimer = setInterval(() => this._poll(), FORUM_POLL_MS);
    else if (!visible && this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
  },

  async _poll() {
    if (this.activeThreadId) {
      try {
        const { replies } = await Forum.getThread(this.activeThreadId);
        if (this._lastKnownReplyCount != null && replies.length > this._lastKnownReplyCount) {
          this._showNewActivityBanner(replies.length - this._lastKnownReplyCount);
        }
      } catch { /* silent — next poll tries again */ }
    } else if (this.activeChannelId) {
      this.openChannel(this.activeChannelId);
    }
  },

  _showNewActivityBanner(n) {
    const banner = document.getElementById('fm-new-activity-banner');
    if (!banner) return;
    banner.innerHTML = `<button class="fm-refresh-banner" id="fm-refresh-now">🔄 ${n} new ${n === 1 ? 'reply' : 'replies'} — click to refresh</button>`;
    document.getElementById('fm-refresh-now').addEventListener('click', () => this.openThread(this.activeThreadId));
  },

  _renderShell() {
    const root = document.getElementById('forum-root');
    root.innerHTML = `
      ${!Auth.user ? `<div class="fm-top-banner">Reading is open to everyone. <button class="btn btn-sm btn-gold" id="fm-top-signin">Sign In</button> to create threads and reply.</div>` : ''}
      <div class="fm-top-banner fm-mentions-banner" id="fm-mentions-banner-row" hidden></div>
      <div class="fm-layout">
        <aside class="fm-sidebar" id="fm-sidebar"></aside>
        <main class="fm-main" id="forum-content"></main>
      </div>
    `;
    this._renderSidebar();
    const topSignin = document.getElementById('fm-top-signin');
    if (topSignin) topSignin.addEventListener('click', () => AccountUI.openAuthModal());
    // The banner's own content/visibility is owned by ForumMentions (see
    // its _paint()), not computed here — _renderShell() can run before
    // ForumMentions.refresh()'s async fetch resolves, so baking the count
    // into this render would show a stale number. Re-paint it immediately
    // from whatever ForumMentions already knows right now.
    ForumMentions._paintBanner();
  },

  _renderSidebar() {
    const sidebar = document.getElementById('fm-sidebar');
    if (!sidebar) return;
    sidebar.innerHTML = this.channels.map(c => `
      <button class="fm-channel-btn${c.id === this.activeChannelId ? ' active' : ''}" data-channel="${c.id}">
        <span class="fm-channel-hash">#</span><span class="fm-channel-name">${escapeHtml(c.name)}</span>
        <span class="fm-channel-count">${c.thread_count}</span>
      </button>`).join('');
    sidebar.querySelectorAll('[data-channel]').forEach(btn => {
      btn.addEventListener('click', () => this.openChannel(btn.dataset.channel));
    });
  },

  async _refreshChannelCounts() {
    try { this.channels = await Forum.listChannels(); this._renderSidebar(); } catch { /* best effort */ }
  },

  async openChannel(channelId) {
    this.activeChannelId = channelId;
    this.activeThreadId = null;
    this._lastKnownReplyCount = null;
    this._renderSidebar();
    const content = document.getElementById('forum-content');
    const channel = this.channels.find(c => c.id === channelId);
    content.innerHTML = `<div class="fm-loading">Loading threads…</div>`;
    try {
      const threads = await Forum.listThreads(channelId);
      content.innerHTML = `
        <div class="fm-channel-header">
          <div><span class="fm-hash">#</span> ${escapeHtml(channel?.name || '')}</div>
          ${Auth.user ? '<button class="btn btn-gold" id="fm-new-thread">+ New Thread</button>' : ''}
        </div>
        <p class="fm-channel-desc">${escapeHtml(channel?.description || '')}</p>
        <div class="fm-thread-list">
          ${threads.length ? threads.map(t => this._threadRowHTML(t)).join('') : '<div class="empty-state" style="padding:30px"><div class="es-icon">💬</div>No threads yet — be the first to post.</div>'}
        </div>
        ${!Auth.user ? '<div class="fm-signin-prompt">Sign in to start a thread. <button class="btn btn-sm btn-gold" id="fm-signin-btn">Sign In</button></div>' : ''}
      `;
      content.querySelectorAll('[data-thread]').forEach(row => {
        row.addEventListener('click', () => this.openThread(row.dataset.thread));
      });
      const newBtn = content.querySelector('#fm-new-thread');
      if (newBtn) newBtn.addEventListener('click', () => this.openNewThreadModal());
      const signinBtn = content.querySelector('#fm-signin-btn');
      if (signinBtn) signinBtn.addEventListener('click', () => AccountUI.openAuthModal());
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  },

  _threadRowHTML(t) {
    return `
      <div class="fm-thread-row" data-thread="${t.id}">
        ${t.pinned ? '<span class="fm-pin" title="Pinned">📌</span>' : ''}
        ${avatarHTML(t.author)}
        <div class="fm-thread-info">
          <div class="fm-thread-title">${escapeHtml(t.title)}</div>
          <div class="fm-thread-meta">by ${escapeHtml(t.author.displayName)} · ${fmtForumTime(t.lastActivity)} · ${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'}</div>
        </div>
      </div>`;
  },

  _reactionBarHTML(kind, id, reactions) {
    return `
      <div class="fm-reactions" data-kind="${kind}" data-id="${id}">
        <div class="fm-reaction-pills">${this._pillsHTML(reactions)}</div>
        <div class="fm-emoji-picker" hidden>${FORUM_EMOJI.map(e => `<button class="fm-emoji-opt" data-emoji="${e}">${e}</button>`).join('')}</div>
        <button class="fm-reaction-add" data-reaction-toggle-picker title="Add reaction">😊+</button>
      </div>`;
  },

  _pillsHTML(reactions) {
    return (reactions || []).map(r => `<button class="fm-reaction-pill${r.reacted ? ' reacted' : ''}" data-emoji="${r.emoji}">${r.emoji} ${r.count}</button>`).join('');
  },

  _canEdit(post) { return Auth.user && Auth.user.id === post.author.id; },
  _canDelete(post, viewerIsAdmin) { return this._canEdit(post) || viewerIsAdmin; },

  async openThread(threadId) {
    this.activeThreadId = threadId;
    const content = document.getElementById('forum-content');
    content.innerHTML = `<div class="fm-loading">Loading…</div>`;
    let data;
    try {
      data = await Forum.getThread(threadId);
    } catch (err) {
      content.innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
      return;
    }
    const { thread, replies, viewerIsAdmin } = data;
    this._lastKnownReplyCount = replies.length;
    const channel = this.channels.find(c => c.id === thread.channelId);

    content.innerHTML = `
      <button class="btn btn-sm" id="fm-back">← Back to #${escapeHtml(channel?.name || '')}</button>
      <div class="fm-post fm-post--op">
        ${avatarHTML(thread.author)}
        <div class="fm-post-body-wrap">
          <div class="fm-post-header">
            <span class="fm-post-author">${escapeHtml(thread.author.displayName)}</span>
            <span class="fm-post-time">${fmtForumTime(thread.createdAt)}${thread.editedAt ? ' (edited)' : ''}</span>
            ${thread.pinned ? '<span class="fm-pin-badge">📌 Pinned</span>' : ''}
          </div>
          <h3 class="fm-thread-title-full">${escapeHtml(thread.title)}</h3>
          <div class="fm-post-content" data-raw="${escapeHtml(thread.body)}">${renderForumMarkdown(thread.body, this.members)}</div>
          ${this._reactionBarHTML('thread', thread.id, thread.reactions)}
          <div class="fm-post-actions">
            ${this._canEdit(thread) ? '<button class="btn btn-sm" data-edit-thread>Edit</button>' : ''}
            ${this._canDelete(thread, viewerIsAdmin) ? '<button class="btn btn-sm btn-danger" data-delete-thread>Delete</button>' : ''}
            ${viewerIsAdmin ? `<button class="btn btn-sm" data-pin-thread>${thread.pinned ? 'Unpin' : 'Pin'}</button>` : ''}
          </div>
        </div>
      </div>

      <div class="fm-replies">${replies.map(r => this._replyPostHTML(r, viewerIsAdmin)).join('')}</div>

      <div id="fm-new-activity-banner"></div>

      ${Auth.user ? `
        <div class="fm-composer">
          <textarea id="fm-reply-input" rows="2" maxlength="8000" placeholder="Reply... (markdown: **bold** *italic* \`code\`, @ to mention)"></textarea>
          <div class="fm-mention-dropdown" id="fm-reply-mention-dropdown" hidden></div>
          <button class="btn btn-gold" id="fm-reply-submit">Send</button>
        </div>
      ` : `<div class="fm-signin-prompt">Sign in to reply. <button class="btn btn-sm btn-gold" id="fm-signin-btn">Sign In</button></div>`}
    `;

    if (Auth.user) wireMentionAutocomplete('fm-reply-input', 'fm-reply-mention-dropdown', () => this.members);
    this._wireThreadDetail(content, thread, viewerIsAdmin);
  },

  _replyPostHTML(r, viewerIsAdmin) {
    const canEdit = this._canEdit(r);
    const canDelete = this._canDelete(r, viewerIsAdmin);
    return `
      <div class="fm-post fm-post--reply" data-reply="${r.id}">
        ${avatarHTML(r.author)}
        <div class="fm-post-body-wrap">
          <div class="fm-post-header">
            <span class="fm-post-author">${escapeHtml(r.author.displayName)}</span>
            <span class="fm-post-time">${fmtForumTime(r.createdAt)}${r.editedAt ? ' (edited)' : ''}</span>
          </div>
          <div class="fm-post-content" data-raw="${escapeHtml(r.body)}">${renderForumMarkdown(r.body, this.members)}</div>
          ${this._reactionBarHTML('reply', r.id, r.reactions)}
          <div class="fm-post-actions">
            ${canEdit ? '<button class="btn btn-sm" data-edit-reply>Edit</button>' : ''}
            ${canDelete ? '<button class="btn btn-sm btn-danger" data-delete-reply>Delete</button>' : ''}
          </div>
        </div>
      </div>`;
  },

  _patchReactionBar(bar, reactions) {
    bar.querySelector('.fm-reaction-pills').innerHTML = this._pillsHTML(reactions);
    bar.querySelector('.fm-emoji-picker').hidden = true;
  },

  _beginEditThread(thread) {
    const op = document.querySelector('.fm-post--op .fm-post-body-wrap');
    op.querySelector('.fm-thread-title-full').outerHTML = `<input type="text" id="fm-edit-title" value="${escapeHtml(thread.title)}" maxlength="150" class="fm-edit-title-input">`;
    op.querySelector('.fm-post-content').outerHTML = `
      <textarea id="fm-edit-body" rows="5" maxlength="8000" class="fm-edit-body-input">${escapeHtml(thread.body)}</textarea>
      <div class="action-row" style="margin-top:6px">
        <button class="btn btn-sm btn-gold" data-save-thread-edit>Save</button>
        <button class="btn btn-sm" data-cancel-thread-edit>Cancel</button>
      </div>`;
  },

  _beginEditReply(replyId) {
    const post = document.querySelector(`[data-reply="${replyId}"]`);
    const contentEl = post.querySelector('.fm-post-content');
    const raw = contentEl.dataset.raw;
    contentEl.outerHTML = `
      <textarea class="fm-edit-body-input fm-post-content" id="fm-edit-reply-body">${escapeHtml(raw)}</textarea>
      <div class="action-row" style="margin-top:6px">
        <button class="btn btn-sm btn-gold" data-save-reply-edit="${replyId}">Save</button>
        <button class="btn btn-sm" data-cancel-reply-edit>Cancel</button>
      </div>`;
  },

  // One delegated listener on #forum-content handles every thread-detail
  // interaction (reactions, edit/delete/pin, reply submit) — including
  // buttons injected later by inline-edit, since delegation on a stable
  // ancestor naturally covers dynamically added descendants too.
  _wireThreadDetail(content, thread, viewerIsAdmin) {
    content.addEventListener('click', async (e) => {
      if (e.target.closest('#fm-back')) { this.openChannel(this.activeChannelId); return; }
      if (e.target.closest('#fm-signin-btn')) { AccountUI.openAuthModal(); return; }

      const pill = e.target.closest('.fm-reaction-pill');
      const emojiOpt = e.target.closest('.fm-emoji-opt');
      if (pill || emojiOpt) {
        if (!Auth.user) { AccountUI.openAuthModal(); return; }
        const bar = (pill || emojiOpt).closest('.fm-reactions');
        const kind = bar.dataset.kind, id = bar.dataset.id, emoji = (pill || emojiOpt).dataset.emoji;
        try {
          const reactions = kind === 'thread' ? await Forum.toggleThreadReaction(id, emoji) : await Forum.toggleReplyReaction(id, emoji);
          this._patchReactionBar(bar, reactions);
        } catch (err) { UI.toast(err.message); }
        return;
      }
      const pickerToggle = e.target.closest('[data-reaction-toggle-picker]');
      if (pickerToggle) {
        if (!Auth.user) { AccountUI.openAuthModal(); return; }
        const picker = pickerToggle.closest('.fm-reactions').querySelector('.fm-emoji-picker');
        picker.hidden = !picker.hidden;
        return;
      }

      if (e.target.closest('[data-edit-thread]')) { this._beginEditThread(thread); return; }
      if (e.target.closest('[data-cancel-thread-edit]')) { this.openThread(thread.id); return; }
      if (e.target.closest('[data-save-thread-edit]')) {
        const title = document.getElementById('fm-edit-title').value;
        const body = document.getElementById('fm-edit-body').value;
        try { await Forum.editThread(thread.id, title, body); this.openThread(thread.id); }
        catch (err) { UI.toast(err.message); }
        return;
      }
      if (e.target.closest('[data-delete-thread]')) {
        if (!confirm('Delete this thread? This cannot be undone.')) return;
        try { await Forum.deleteThread(thread.id); UI.toast('Thread deleted'); this.openChannel(this.activeChannelId); this._refreshChannelCounts(); }
        catch (err) { UI.toast(err.message); }
        return;
      }
      if (e.target.closest('[data-pin-thread]')) {
        try { const pinned = await Forum.togglePin(thread.id); UI.toast(pinned ? 'Pinned' : 'Unpinned'); this.openThread(thread.id); }
        catch (err) { UI.toast(err.message); }
        return;
      }

      const editReplyBtn = e.target.closest('[data-edit-reply]');
      if (editReplyBtn) { this._beginEditReply(editReplyBtn.closest('[data-reply]').dataset.reply); return; }
      if (e.target.closest('[data-cancel-reply-edit]')) { this.openThread(thread.id); return; }
      const saveReplyBtn = e.target.closest('[data-save-reply-edit]');
      if (saveReplyBtn) {
        const body = document.getElementById('fm-edit-reply-body').value;
        try { await Forum.editReply(saveReplyBtn.dataset.saveReplyEdit, body); this.openThread(thread.id); }
        catch (err) { UI.toast(err.message); }
        return;
      }
      const deleteReplyBtn = e.target.closest('[data-delete-reply]');
      if (deleteReplyBtn) {
        if (!confirm('Delete this reply?')) return;
        const replyId = deleteReplyBtn.closest('[data-reply]').dataset.reply;
        try { await Forum.deleteReply(replyId); this.openThread(thread.id); }
        catch (err) { UI.toast(err.message); }
        return;
      }

      if (e.target.closest('#fm-reply-submit')) {
        const ta = document.getElementById('fm-reply-input');
        const body = ta.value.trim();
        if (!body) return;
        const btn = e.target.closest('#fm-reply-submit');
        btn.disabled = true;
        try {
          await Forum.createReply(thread.id, body);
          this.openThread(thread.id);
        } catch (err) {
          UI.toast(err.message);
          btn.disabled = false;
        }
        return;
      }
    });
  },

  openNewThreadModal() {
    if (!Auth.user) { AccountUI.openAuthModal(); return; }
    const channel = this.channels.find(c => c.id === this.activeChannelId);
    UI.openModal(`
      <div class="modal-header"><h3>New Thread in #${escapeHtml(channel?.name || '')}</h3><button class="modal-close" id="modal-close">✕</button></div>
      <div class="modal-body">
        <div class="form-field"><label for="fm-new-title">Title</label><input type="text" id="fm-new-title" maxlength="150"></div>
        <div class="form-field" style="position:relative">
          <label for="fm-new-body">Body</label>
          <textarea id="fm-new-body" rows="6" maxlength="8000" placeholder="Markdown: **bold**, *italic*, \`code\`, ~~strike~~, &gt; quote, @mention"></textarea>
          <div class="fm-mention-dropdown" id="fm-new-mention-dropdown" hidden></div>
        </div>
        <div id="fm-new-error" class="caveat" style="display:none;border-color:var(--danger,#a33)"></div>
        <div class="action-row"><button class="btn btn-gold" id="fm-new-submit">Post Thread</button></div>
      </div>
    `);
    document.getElementById('modal-close').addEventListener('click', () => UI.closeModal());
    wireMentionAutocomplete('fm-new-body', 'fm-new-mention-dropdown', () => this.members);
    document.getElementById('fm-new-submit').addEventListener('click', async (e) => {
      const title = document.getElementById('fm-new-title').value.trim();
      const body = document.getElementById('fm-new-body').value.trim();
      const errEl = document.getElementById('fm-new-error');
      errEl.style.display = 'none';
      if (!title || !body) { errEl.textContent = 'Title and body are required.'; errEl.style.display = ''; return; }
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const created = await Forum.createThread(this.activeChannelId, title, body);
        UI.closeModal();
        UI.toast('Thread posted');
        this.openThread(created.id);
        this._refreshChannelCounts();
      } catch (err) {
        errEl.textContent = err.message; errEl.style.display = '';
        btn.disabled = false;
      }
    });
  },
};
