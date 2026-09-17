# RepoMarks Browser Extension

A small Chrome (Manifest V3) extension that saves the current tab or a right-clicked link to your
self-hosted [RepoMarks](../) server. Plain JavaScript, no build step, no dependencies.

## Features

- Popup with URL, title, tags, optional description and a collection picker (nested collections are indented).
- Right-click context menu item **Save to RepoMarks** on pages and links.
- Keyboard shortcut `Ctrl+Shift+S` (`Command+Shift+S` on macOS) to save the current tab.
- Success and failure notifications.
- Settings page with a **Test connection** button.

## Install (unpacked)

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select this `extension/` directory.
4. Open the extension's **Settings** (Details -> Extension options) and enter:
   - **Server URL** - e.g. `https://bookmarks.example.com` or `http://192.168.1.10:8080`
   - **API Key** - created in RepoMarks under **Settings -> API keys**
5. Click **Save**, then **Test connection** to confirm the server accepts the key.

## Usage

- Click the RepoMarks toolbar icon to open the popup, edit the details and click **Save**.
- Right-click a page or a link and choose **Save to RepoMarks**.
- Press `Ctrl+Shift+S` / `Command+Shift+S` to save the current tab without opening the popup.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `contextMenus` | Adds the **Save to RepoMarks** item to the right-click menu. |
| `storage` | Stores the server URL and API key in `chrome.storage.sync`. |
| `activeTab` | Reads the URL and title of the active tab when you invoke the extension. |
| `notifications` | Shows success or failure notifications for background saves. |
| `host_permissions` (`http://*/*`, `https://*/*`) | Allows requests to your server, which may be a plain HTTP address on a LAN. |

## Notes

- The server must be reachable from the browser. Plain HTTP LAN addresses such as
  `http://192.168.1.10:8080` work; browsers may warn about insecure origins, but the extension sends
  the request as configured.
- The API key is sent as an `Authorization: Bearer <API_KEY>` header on every request.
- Requests are sent with `fetchMetadata: false`, so saving is fast and does not depend on the server
  being able to reach the bookmarked page. The server can still fill in metadata later via RepoMarks.
- If the API key is rejected (HTTP 401), the popup offers to open the settings page.

## Troubleshooting

- **"Invalid API key"** - recreate or copy the key again under RepoMarks Settings -> API keys, then
  save it in the extension settings.
- **"Could not save the link: Failed to fetch"** - the server URL is wrong, the server is down, or a
  firewall blocks the browser.
- **"Already saved"** - RepoMarks rejects duplicate URLs (HTTP 409); the link already exists.
