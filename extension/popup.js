const $ = (id) => document.getElementById(id);

function trimBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

function flattenCollections(collections) {
  const byParent = new Map();
  for (const collection of collections || []) {
    const key = collection.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(collection);
  }
  const result = [];
  const walk = (parentId, depth) => {
    for (const collection of byParent.get(parentId) || []) {
      result.push({ id: collection.id, label: '\u3000'.repeat(depth) + collection.name });
      walk(collection.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

function addOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  $('collection').appendChild(option);
}

async function loadCollections(base, apiKey) {
  try {
    const res = await fetch(`${base}/api/collections`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      setStatus(res.status === 401 ? 'Invalid API key.' : `Could not load collections (HTTP ${res.status}).`, 'error');
      return;
    }
    for (const item of flattenCollections(await res.json())) {
      addOption(item.id, item.label);
    }
  } catch (err) {
    setStatus(`Could not load collections: ${err.message || 'network error'}.`, 'error');
  }
}

async function init() {
  addOption('', 'Uncategorized');
  const { serverUrl = '', apiKey = '' } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  const base = trimBase(serverUrl);

  if (base) $('open-app').href = base;
  else $('open-app').hidden = true;

  if (!base || !apiKey) {
    $('setup').hidden = false;
    return;
  }

  $('form').hidden = false;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    $('url').value = tab.url || '';
    $('title').value = tab.title || '';
  }
  loadCollections(base, apiKey);
}

async function onSubmit(event) {
  event.preventDefault();
  const { serverUrl = '', apiKey = '' } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  const base = trimBase(serverUrl);
  if (!base || !apiKey) {
    $('form').hidden = true;
    $('setup').hidden = false;
    return;
  }

  const url = $('url').value.trim();
  if (!url) {
    setStatus('No URL to save.', 'error');
    return;
  }

  const payload = {
    url,
    tags: $('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean),
    collectionId: $('collection').value || null,
    fetchMetadata: false,
  };
  const title = $('title').value.trim();
  const description = $('description').value.trim();
  if (title) payload.title = title;
  if (description) payload.description = description;

  const button = $('save');
  button.disabled = true;
  button.textContent = 'Saving\u2026';
  $('open-options').hidden = true;

  try {
    const res = await fetch(`${base}/api/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 201) {
      setStatus('Saved to RepoMarks.', 'success');
      setTimeout(() => window.close(), 900);
      return;
    }
    if (res.status === 409) {
      setStatus('Already saved.', 'warn');
      return;
    }
    if (res.status === 401) {
      setStatus('Invalid API key.', 'error');
      $('open-options').hidden = false;
      return;
    }
    let detail = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data && data.error) detail = data.error;
    } catch {}
    setStatus(`Save failed: ${detail}`, 'error');
  } catch (err) {
    setStatus(`Save failed: ${err.message || 'network error'}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Save';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  $('form').addEventListener('submit', onSubmit);
  for (const button of document.querySelectorAll('.open-options')) {
    button.addEventListener('click', () => chrome.runtime.openOptionsPage());
  }
  const sidePanelButton = $('open-side-panel');
  if (sidePanelButton) {
    if (!chrome.sidePanel || window.top !== window) {
      sidePanelButton.hidden = true;
    } else {
      sidePanelButton.addEventListener('click', async () => {
        try {
          const current = await chrome.windows.getCurrent();
          await chrome.sidePanel.open({ windowId: current.id });
          window.close();
        } catch {
          sidePanelButton.hidden = true;
        }
      });
    }
  }
});
