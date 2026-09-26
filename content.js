// content.js — runs on every page/frame.
// 1) Draws a small clickable icon over email-ish inputs so a mask can be
//    generated and filled in with one click.
// 2) Provides a lightweight toast used by background.js (context-menu flow).

(() => {
  if (window.__relayContentLoaded) return;
  window.__relayContentLoaded = true;

  const PROCESSED_ATTR = "data-relay-processed";
  const iconByInput = new WeakMap();

  function isEmailField(el) {
    if (!(el instanceof HTMLInputElement)) return false;
    if (el.disabled || el.readOnly) return false;
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "email") return true;
    if (type !== "text") return false;
    const hay = `${el.autocomplete} ${el.name} ${el.id} ${el.placeholder}`.toLowerCase();
    return /email/.test(hay);
  }

  function makeIcon() {
    const icon = document.createElement("div");
    icon.className = "relay-inline-icon";
    icon.title = "Generate a Firefox Relay email mask";
    icon.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="2" y="5" width="20" height="14" rx="3" stroke="currentColor" stroke-width="2"/>' +
      '<path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>";
    document.documentElement.appendChild(icon);
    return icon;
  }

  function positionIcon(input, icon) {
    const rect = input.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      icon.style.display = "none";
      return;
    }
    icon.style.display = "flex";
    const size = Math.min(24, rect.height - 6);
    icon.style.width = `${Math.max(18, size)}px`;
    icon.style.height = `${Math.max(18, size)}px`;
    icon.style.top = `${window.scrollY + rect.top + (rect.height - Math.max(18, size)) / 2}px`;
    icon.style.left = `${window.scrollX + rect.right - Math.max(18, size) - 6}px`;
  }

  function attachIcon(input) {
    if (input.hasAttribute(PROCESSED_ATTR)) return;
    input.setAttribute(PROCESSED_ATTR, "1");

    const icon = makeIcon();
    iconByInput.set(input, icon);
    positionIcon(input, icon);

    icon.addEventListener("mousedown", (e) => e.preventDefault()); // don't steal focus
    icon.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      icon.classList.add("relay-loading");
      const hostname = location.hostname;
      const response = await chrome.runtime.sendMessage({
        type: "CREATE_ALIAS",
        payload: { description: hostname, generatedFor: hostname },
      });
      icon.classList.remove("relay-loading");

      if (!response?.ok) {
        showToast(
          response?.error === "unauthorized" || response?.error === "no_api_key"
            ? "Add your Relay API key in the extension's options page first."
            : "Couldn't create a mask right now."
        );
        return;
      }

      const address = response.data.full_address;
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      setter.call(input, address);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      showToast(`Filled in a new mask: ${address}`);
    });

    const reposition = () => positionIcon(input, icon);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    new ResizeObserver(reposition).observe(input);

    input.addEventListener(
      "blur",
      () => {
        // Keep icon visible; only fade if the field gets removed.
      },
      { once: false }
    );
  }

  function scan(root = document) {
    root.querySelectorAll?.("input").forEach((el) => {
      if (isEmailField(el)) attachIcon(el);
    });
  }

  scan();

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node instanceof HTMLInputElement && isEmailField(node)) {
          attachIcon(node);
        } else {
          scan(node);
        }
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // --- toast, used here and by background.js's executeScript for the
  // right-click "insert alias" context menu flow ---
  function showToast(message) {
    let toast = document.getElementById("relay-ext-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "relay-ext-toast";
      document.documentElement.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("relay-toast-hide");
    toast.classList.add("relay-toast-show");
    clearTimeout(toast.__hideTimer);
    toast.__hideTimer = setTimeout(() => {
      toast.classList.remove("relay-toast-show");
      toast.classList.add("relay-toast-hide");
    }, 3200);
  }
  window.__relayShowToast = showToast;
})();
