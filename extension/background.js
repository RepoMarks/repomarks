const MENU_ID = 'repomarks-save-page';
const HIGHLIGHT_MENU_ID = 'repomarks-save-highlight';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Save to RepoMarks',
    contexts: ['page', 'link'],
  });
  chrome.contextMenus.create({
    id: HIGHLIGHT_MENU_ID,
    title: 'Save selection as highlight',
    contexts: ['selection'],
  });
});

async function apiRequest(path, options = {}) {
  const { serverUrl = '', apiKey = '' } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  const base = String(serverUrl).trim().replace(/\/+$/, '');
  if (!base || !apiKey) {
    return { ok: false, status: 0, error: 'RepoMarks is not configured. Open the extension settings.' };
  }
  try {
    const res = await fetch(`${base}/api${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(options.headers || {}),
      },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.message || 'Network error' };
  }
}

async function saveSelectionHighlight(url, text) {
  if (!text) return;
  const existing = await apiRequest(`/links/by-url?url=${encodeURIComponent(url)}`);
  let linkId = existing.ok ? existing.data.id : null;
  if (!linkId) {
    const created = await apiRequest('/links', {
      method: 'POST',
      body: JSON.stringify({ url, fetchMetadata: false }),
    });
    if (!created.ok || !created.data?.id) {
      notify('RepoMarks', `Could not save the highlight: ${created.data?.error || created.error || created.status}`);
      return;
    }
    linkId = created.data.id;
  }
  const result = await apiRequest(`/links/${linkId}/highlights`, {
    method: 'POST',
    body: JSON.stringify({ text, color: 'yellow' }),
  });
  if (result.ok) notify('RepoMarks', 'Highlight saved.');
  else notify('RepoMarks', `Could not save the highlight: ${result.data?.error || result.error || result.status}`);
}

async function saveLink(payload) {
  const result = await apiRequest('/links', {
    method: 'POST',
    body: JSON.stringify({ ...payload, fetchMetadata: false }),
  });
  if (result.ok) return { ok: true };
  let detail = result.error || `HTTP ${result.status}`;
  if (result.data && result.data.error) detail = result.data.error;
  if (result.status === 409) detail = 'Already saved.';
  if (result.status === 401) detail = 'Invalid API key.';
  return { ok: false, error: detail };
}

function notify(title, message) {
  chrome.notifications.create(`repomarks-${Date.now()}`, {
    type: 'basic',
    title,
    message,
  });
}

async function saveAndNotify(payload) {
  const result = await saveLink(payload);
  if (result.ok) notify('RepoMarks', 'Link saved.');
  else notify('RepoMarks', `Could not save the link: ${result.error}`);
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === HIGHLIGHT_MENU_ID) {
    const url = info.pageUrl || (tab && tab.url);
    if (url && info.selectionText) {
      saveSelectionHighlight(url, info.selectionText);
    }
    return;
  }
  if (info.menuItemId !== MENU_ID) return;

  if (info.linkUrl) {
    const payload = { url: info.linkUrl };
    if (info.selectionText) payload.title = info.selectionText;
    saveAndNotify(payload);
    return;
  }

  const url = info.pageUrl || (tab && tab.url);
  if (!url) {
    notify('RepoMarks', 'No URL found for this page.');
    return;
  }
  const payload = { url };
  if (tab && tab.title) payload.title = tab.title;
  saveAndNotify(payload);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-current-tab') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    notify('RepoMarks', 'No URL found for the current tab.');
    return;
  }
  const payload = { url: tab.url };
  if (tab.title) payload.title = tab.title;
  saveAndNotify(payload);
});
