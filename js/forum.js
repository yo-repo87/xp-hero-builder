// ---------------------------------------------------------------------------
// forum.js — thin API client for the Forum tab, mirroring auth.js's cloud-
// save section. Reads are public (no account needed); every call still
// routes through Auth.authedFetch so a signed-in visitor's bearer token
// rides along when present (marks their own reactions, lets write calls
// succeed) without forcing sign-in just to browse.
// ---------------------------------------------------------------------------

const Forum = {
  async listChannels() {
    const res = await Auth.authedFetch('/forum/channels');
    if (!res.ok) throw new Error('Could not load forum channels');
    return (await res.json()).channels;
  },

  async listThreads(channelId) {
    const res = await Auth.authedFetch(`/forum/channels/${channelId}/threads`);
    if (!res.ok) throw new Error('Could not load threads');
    return (await res.json()).threads;
  },

  async getThread(threadId) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}`);
    if (!res.ok) throw new Error('Could not load that thread');
    return res.json(); // { thread, replies, viewerIsAdmin }
  },

  async createThread(channelId, title, body) {
    const res = await Auth.authedFetch(`/forum/channels/${channelId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create thread');
    return data.thread;
  },

  async editThread(threadId, title, body) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not save edit');
  },

  async deleteThread(threadId) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Could not delete thread');
  },

  async togglePin(threadId) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}/pin`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not pin thread');
    return data.pinned;
  },

  async createReply(threadId, body) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not post reply');
    return data.reply;
  },

  async editReply(replyId, body) {
    const res = await Auth.authedFetch(`/forum/replies/${replyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Could not save edit');
  },

  async deleteReply(replyId) {
    const res = await Auth.authedFetch(`/forum/replies/${replyId}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error('Could not delete reply');
  },

  async toggleThreadReaction(threadId, emoji) {
    const res = await Auth.authedFetch(`/forum/threads/${threadId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not react');
    return data.reactions;
  },

  async toggleReplyReaction(replyId, emoji) {
    const res = await Auth.authedFetch(`/forum/replies/${replyId}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not react');
    return data.reactions;
  },

  _membersCache: null,
  async listMembers() {
    if (this._membersCache) return this._membersCache;
    const res = await Auth.authedFetch('/forum/members');
    if (!res.ok) return [];
    this._membersCache = (await res.json()).members;
    return this._membersCache;
  },
};
