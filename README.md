# Relay Aliases for Chrome

An unofficial Manifest V3 companion extension for [Firefox Relay](https://relay.firefox.com),
since Mozilla's official add-on was Manifest V2 and got pulled from the Chrome Web
Store. This talks directly to Relay's API - it's not affiliated with Mozilla.

## What it does

- **Popup**: view all your Relay masks (aliases), search them, toggle
  forwarding on/off, delete them, and create a new one for the site you're
  currently on (auto-copies it to your clipboard).
- **Inline icon**: an icon appears inside email-looking `<input>` fields on
  any page - click it to generate a mask and fill it in on the spot.
- **Right-click menu**: right-click any editable field > "Insert a new Relay
  email mask here" to generate + fill in without opening the popup.

## How it authenticates

Relay's official API doesn't offer third-party OAuth for extensions, so -
same as the various community API clients - this uses a **Relay API key**:

1. Sign in at [relay.firefox.com](https://relay.firefox.com).
2. Open your profile icon (top right) > **Settings**.
3. Copy the value under **API key** (generate one if you don't have it yet).
4. Paste it into this extension's options page.

The key is stored only in `chrome.storage.local` on your machine and is sent
only to `relay.firefox.com`.

⚠️ Relay's API isn't officially documented for third-party use, so Mozilla
could change field names or endpoints without notice - if something breaks,
that's the most likely reason.

## Installing in Chrome

1. Unzip this folder somewhere permanent (don't delete it after installing -
   unpacked extensions load from the folder each time).
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select this folder.
5. Click the extension icon > gear icon > paste your API key > Save.

## Files

- `manifest.json` - MV3 manifest
- `background.js` - service worker; all Relay API calls, context menu
- `content.js` / `content.css` - inline icon on email fields + toast messages
- `popup.html` / `popup.js` / `popup.css` - the toolbar popup UI
- `options.html` / `options.js` / `options.css` - API key setup page
