const $ = (id) => document.getElementById(id);

function trimBase(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = kind || '';
}

async function load() {
  const { serverUrl = '', apiKey = '' } = await chrome.storage.sync.get(['serverUrl', 'apiKey']);
  $('server-url').value = serverUrl;
  $('api-key').value = apiKey;
}

async function save() {
  const serverUrl = trimBase($('server-url').value);
  const apiKey = $('api-key').value.trim();
  if (!serverUrl) {
    setStatus('Server URL is required.', 'error');
    return;
  }
  await chrome.storage.sync.set({ serverUrl, apiKey });
  $('server-url').value = serverUrl;
  setStatus('Settings saved.', 'success');
}

async function testConnection() {
  const serverUrl = trimBase($('server-url').value);
  const apiKey = $('api-key').value.trim();
  if (!serverUrl) {
    setStatus('Server URL is required.', 'error');
    return;
  }
  if (!apiKey) {
    setStatus('API key is required.', 'error');
    return;
  }
  setStatus('Testing\u2026');
  try {
    const res = await fetch(`${serverUrl}/api/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      setStatus('Connected. The server accepted this API key.', 'success');
      return;
    }
    if (res.status === 401) {
      setStatus('Failed: invalid API key.', 'error');
      return;
    }
    setStatus(`Failed: HTTP ${res.status}`, 'error');
  } catch (err) {
    setStatus(`Failed: ${err.message || 'network error'}`, 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  $('save').addEventListener('click', save);
  $('test').addEventListener('click', testConnection);
});
