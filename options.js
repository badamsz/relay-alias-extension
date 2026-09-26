const apiKeyInput = document.getElementById("apiKeyInput");
const toggleVisibility = document.getElementById("toggleVisibility");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const status = document.getElementById("status");

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
  if (message) {
    clearTimeout(setStatus.__t);
    setStatus.__t = setTimeout(() => {
      status.textContent = "";
    }, 2500);
  }
}

async function load() {
  const { apiKey } = await chrome.storage.local.get("apiKey");
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
}

toggleVisibility.addEventListener("click", () => {
  apiKeyInput.type = apiKeyInput.type === "password" ? "text" : "password";
});

saveBtn.addEventListener("click", async () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    setStatus("Enter a key first.", true);
    return;
  }
  await chrome.storage.local.set({ apiKey: value });

  // Quick sanity check against the API so typos are caught immediately.
  saveBtn.disabled = true;
  const original = saveBtn.textContent;
  saveBtn.textContent = "Checking…";
  try {
    const res = await fetch("https://relay.firefox.com/api/v1/profiles/", {
      headers: { Authorization: `Token ${value}` },
    });
    if (res.ok) {
      setStatus("Saved — key looks valid.");
    } else if (res.status === 401 || res.status === 403) {
      setStatus("Saved, but Relay rejected this key. Double-check it.", true);
    } else {
      setStatus("Saved (couldn't verify right now).");
    }
  } catch (e) {
    setStatus("Saved (couldn't reach Relay to verify).");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = original;
  }
});

clearBtn.addEventListener("click", async () => {
  await chrome.storage.local.remove("apiKey");
  apiKeyInput.value = "";
  setStatus("Key removed.");
});

load();
