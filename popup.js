const setupView = document.getElementById("setupView");
const mainView = document.getElementById("mainView");
const errorView = document.getElementById("errorView");
const errorText = document.getElementById("errorText");

const siteHostEl = document.getElementById("siteHost");
const newAliasBtn = document.getElementById("newAliasBtn");
const newAliasLabel = document.getElementById("newAliasLabel");
const blockPromoCheckbox = document.getElementById("blockPromoCheckbox");
const quotaLine = document.getElementById("quotaLine");
const searchInput = document.getElementById("searchInput");
const listStatus = document.getElementById("listStatus");
const aliasListEl = document.getElementById("aliasList");

let currentHostname = "";
let allAliases = [];

function showView(view) {
  [setupView, mainView, errorView].forEach((v) => v.classList.add("hidden"));
  view.classList.remove("hidden");
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast.__t);
  toast.__t = setTimeout(() => toast.classList.remove("show"), 2200);
}

function matchesHost(alias, hostname) {
  const target = `${alias.generated_for || ""} ${alias.description || ""}`.toLowerCase();
  return !!hostname && target.includes(hostname.toLowerCase());
}

function renderList(filterText = "") {
  const query = filterText.trim().toLowerCase();
  const filtered = allAliases.filter((a) => {
    if (!query) return true;
    return (
      a.full_address.toLowerCase().includes(query) ||
      (a.description || "").toLowerCase().includes(query) ||
      (a.generated_for || "").toLowerCase().includes(query)
    );
  });

  filtered.sort((a, b) => {
    const aMatch = matchesHost(a, currentHostname) ? 0 : 1;
    const bMatch = matchesHost(b, currentHostname) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  aliasListEl.innerHTML = "";
  listStatus.textContent = filtered.length
    ? ""
    : allAliases.length
    ? "No masks match your search."
    : "You don't have any masks yet.";

  for (const alias of filtered) {
    aliasListEl.appendChild(renderAliasItem(alias));
  }
}

function renderAliasItem(alias) {
  const li = document.createElement("li");
  li.className = "alias-item" + (matchesHost(alias, currentHostname) ? " current-site" : "");

  const top = document.createElement("div");
  top.className = "alias-top";

  const addr = document.createElement("span");
  addr.className = "alias-address";
  addr.textContent = alias.full_address;
  addr.title = "Click to copy";
  addr.addEventListener("click", () => {
    navigator.clipboard.writeText(alias.full_address).then(() => {
      showToast(`Copied ${alias.full_address}`);
    });
  });

  const label = document.createElement("label");
  label.className = "switch";
  label.title = alias.enabled ? "Forwarding on" : "Forwarding paused";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = !!alias.enabled;
  const slider = document.createElement("span");
  slider.className = "slider";
  label.appendChild(toggle);
  label.appendChild(slider);

  toggle.addEventListener("change", async () => {
    toggle.disabled = true;
    const res = await chrome.runtime.sendMessage({
      type: "UPDATE_ALIAS",
      id: alias.id,
      patch: { enabled: toggle.checked },
    });
    toggle.disabled = false;
    if (res?.ok) {
      alias.enabled = toggle.checked;
      showToast(toggle.checked ? "Forwarding turned on" : "Forwarding paused");
    } else {
      toggle.checked = !toggle.checked;
      showToast("Couldn't update that mask.");
    }
  });

  top.appendChild(addr);
  top.appendChild(label);

  const desc = document.createElement("div");
  desc.className = "alias-desc";
  desc.textContent = alias.description || alias.generated_for || "No label";

  const stats = document.createElement("div");
  stats.className = "alias-stats";
  stats.textContent = `${alias.num_forwarded || 0} forwarded · ${alias.num_blocked || 0} blocked${
    alias.num_spam ? ` · ${alias.num_spam} marked spam` : ""
  }`;

  const actions = document.createElement("div");
  actions.className = "alias-actions";

  const delBtn = document.createElement("button");
  delBtn.className = "link-btn danger";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", async () => {
    if (!confirm(`Delete ${alias.full_address}? This can't be undone.`)) return;
    delBtn.disabled = true;
    const res = await chrome.runtime.sendMessage({ type: "DELETE_ALIAS", id: alias.id });
    if (res?.ok) {
      allAliases = allAliases.filter((a) => a.id !== alias.id);
      renderList(searchInput.value);
      showToast("Mask deleted");
    } else {
      delBtn.disabled = false;
      showToast("Couldn't delete that mask.");
    }
  });

  actions.appendChild(delBtn);

  li.appendChild(top);
  li.appendChild(desc);
  li.appendChild(stats);
  li.appendChild(actions);
  return li;
}

async function loadAliasesAndProfile() {
  listStatus.textContent = "Loading your masks…";
  const [listRes, profileRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: "LIST_ALIASES" }),
    chrome.runtime.sendMessage({ type: "GET_PROFILE" }),
  ]);

  if (!listRes?.ok) {
    if (listRes?.error === "unauthorized" || listRes?.error === "no_api_key") {
      showView(setupView);
    } else {
      errorText.textContent = "Couldn't load your masks. Check your connection and API key.";
      showView(errorView);
    }
    return;
  }

  allAliases = listRes.data || [];
  renderList(searchInput.value);

  if (profileRes?.ok && profileRes.data) {
    const profile = profileRes.data;
    if (!profile.has_premium) {
      quotaLine.textContent = `${allAliases.length} of 5 free masks used`;
      quotaLine.classList.remove("hidden");
    } else {
      quotaLine.classList.add("hidden");
    }
  }

  showView(mainView);
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    currentHostname = tab?.url ? new URL(tab.url).hostname : "";
  } catch (e) {
    currentHostname = "";
  }
  siteHostEl.textContent = currentHostname || "this page";
  newAliasLabel.textContent = currentHostname
    ? `+ New mask for ${currentHostname}`
    : "+ New mask";

  const { hasKey } = await chrome.runtime.sendMessage({ type: "HAS_API_KEY" });
  if (!hasKey) {
    showView(setupView);
    return;
  }

  await loadAliasesAndProfile();
}

newAliasBtn.addEventListener("click", async () => {
  newAliasBtn.disabled = true;
  const originalLabel = newAliasLabel.textContent;
  newAliasLabel.textContent = "Creating…";

  const res = await chrome.runtime.sendMessage({
    type: "CREATE_ALIAS",
    payload: {
      description: currentHostname,
      generatedFor: currentHostname,
      blockPromotional: blockPromoCheckbox.checked,
    },
  });

  newAliasBtn.disabled = false;
  newAliasLabel.textContent = originalLabel;

  if (!res?.ok) {
    showToast(
      res?.error === "unauthorized"
        ? "Your API key looks invalid. Check it in Settings."
        : "Couldn't create a mask (maybe you're at your plan limit?)."
    );
    return;
  }

  allAliases.unshift(res.data);
  renderList(searchInput.value);
  navigator.clipboard.writeText(res.data.full_address).then(() => {
    showToast(`Created & copied ${res.data.full_address}`);
  });
});

searchInput.addEventListener("input", () => renderList(searchInput.value));

document.getElementById("settingsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("openOptionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("retryBtn").addEventListener("click", () => {
  init();
});

init();
