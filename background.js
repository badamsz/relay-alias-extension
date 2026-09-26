// background.js — service worker
// Centralizes all communication with the Firefox Relay API.
// Relay's API uses Django REST Framework token auth:
//   Authorization: Token <api key>
// Users get their API key from https://relay.firefox.com -> profile icon -> Settings.

const API_BASE = "https://relay.firefox.com/api/v1";

async function getApiKey() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  return apiKey || null;
}

async function relayFetch(path, options = {}) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, error: "no_api_key" };
  }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Token ${apiKey}`,
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    return { ok: false, status: 0, error: "network_error", detail: String(e) };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, status: res.status, error: "unauthorized" };
  }

  if (res.status === 204) {
    return { ok: true, status: 204, data: null };
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no body / not JSON
  }

  if (!res.ok) {
    return { ok: false, status: res.status, error: "api_error", data };
  }

  return { ok: true, status: res.status, data };
}

async function listAliases() {
  return relayFetch("/relayaddresses/");
}

async function getProfile() {
  const result = await relayFetch("/profiles/");
  if (result.ok && Array.isArray(result.data)) {
    result.data = result.data[0] || null;
  }
  return result;
}

async function createAlias({ description, generatedFor, blockPromotional }) {
  const body = {
    enabled: true,
    description: description || "",
  };
  if (generatedFor) body.generated_for = generatedFor;
  if (typeof blockPromotional === "boolean") {
    body.block_list_emails = blockPromotional;
  }
  return relayFetch("/relayaddresses/", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function updateAlias(id, patch) {
  return relayFetch(`/relayaddresses/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function deleteAlias(id) {
  return relayFetch(`/relayaddresses/${id}/`, { method: "DELETE" });
}

// --- Context menu: right-click any editable field to drop in a fresh alias ---

const MENU_ID = "relay-insert-alias";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Insert a new Relay email mask here",
    contexts: ["editable"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  let hostname = "";
  try {
    hostname = new URL(tab.url).hostname;
  } catch (e) {
    /* ignore */
  }

  const result = await createAlias({
    description: hostname,
    generatedFor: hostname,
  });

  if (!result.ok) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
      func: (errorCode) => {
        window.__relayShowToast?.(
          errorCode === "unauthorized"
            ? "Relay: add your API key in the extension options first."
            : "Relay: couldn't create a mask (are you at your free/plan limit?)."
        );
      },
      args: [result.error],
    });
    return;
  }

  const fullAddress = result.data.full_address;

  chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
    func: (address) => {
      const el = document.activeElement;
      const isFillable =
        el &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (!isFillable) {
        window.__relayShowToast?.(`Copied ${address} — paste it in the field.`);
        navigator.clipboard?.writeText(address).catch(() => {});
        return;
      }
      if (el.isContentEditable) {
        el.textContent = address;
      } else {
        const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, address);
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      window.__relayShowToast?.(`Inserted new mask: ${address}`);
    },
    args: [fullAddress],
  });
});

// --- Message bridge for popup.js and content.js ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message?.type) {
      case "HAS_API_KEY": {
        sendResponse({ hasKey: !!(await getApiKey()) });
        break;
      }
      case "LIST_ALIASES": {
        sendResponse(await listAliases());
        break;
      }
      case "GET_PROFILE": {
        sendResponse(await getProfile());
        break;
      }
      case "CREATE_ALIAS": {
        sendResponse(await createAlias(message.payload || {}));
        break;
      }
      case "UPDATE_ALIAS": {
        sendResponse(await updateAlias(message.id, message.patch || {}));
        break;
      }
      case "DELETE_ALIAS": {
        sendResponse(await deleteAlias(message.id));
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown_message" });
    }
  })();
  return true; // keep the message channel open for the async response
});
