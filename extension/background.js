const MENU_ID = 'repomarks-save-page';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Save to RepoMarks',
    contexts: ['page', 'link'],
  });
});

async function saveLink(payload) {
  const { serverUrl = '', apiKey = '' } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  const base = String(serverUrl).trim().replace(/\/+$/, '');
  if (!base || !apiKey) {
    return { ok: false, error: 'RepoMarks is not configured. Open the extension settings.' };
  }
  try {
    const res = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...payload, fetchMetadata: false }),
    });
    if (res.ok) return { ok: true };

    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) detail = data.error;
    } catch {}
    if (res.status === 409) detail = 'Already saved.';
    if (res.status === 401) detail = 'Invalid API key.';
    return { ok: false, error: detail };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
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
