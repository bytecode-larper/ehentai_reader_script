import { parseViewerDoc } from "./parser";
import { fetchViewerPage, prefetchBoth, pageCache } from "./network";
import { injectShell, renderPage, applyMode, showToast } from "./ui";
import type { UIRefs } from "./ui";
import { log, warn, SETTINGS, registerMenuCommands } from "./config";

document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";

let pendingNav: string | null = null;
let isNavigating = false;
let ui: UIRefs;

// session state: current mode for this tab/gallery
let currentFitHeight = SETTINGS.fitHeight;

async function navigateTo(url: string | undefined | null): Promise<void> {
  if (!url) return;
  pendingNav = url;
  if (isNavigating) return;

  while (pendingNav) {
    const target = pendingNav;
    pendingNav = null;
    isNavigating = true;
    try {
      const data = await fetchViewerPage(target);
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } catch (e) {
      warn("navigation failed", target, e);
    }
    isNavigating = false;
  }
}

function init() {
  log("init");

  const initData = parseViewerDoc(document, location.href);
  pageCache.set(location.href, initData);

  ui = injectShell(initData);
  applyMode(currentFitHeight);
  renderPage(ui, initData, currentFitHeight, true);
  prefetchBoth(initData);

  // Initialize menu commands
  registerMenuCommands(() => {
    applyMode(currentFitHeight);
  });

  // Always clear — even if DOMContentLoaded already fired or was missed
  document.documentElement.style.cssText = "";
  log("SPA ready");

  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } else navigateTo(url);
  });

  ui.elPrev.addEventListener("click", () => navigateTo(ui.elPrev.dataset.href));
  ui.elNext.addEventListener("click", () => navigateTo(ui.elNext.dataset.href));

  // Click-to-navigate on main image
  ui.elImg.addEventListener("click", (e) => {
    const rect = ui.elImg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.5) {
      navigateTo(ui.elPrev.dataset.href);
    } else {
      navigateTo(ui.elNext.dataset.href);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toUpperCase();

    switch (k) {
      case "F":
        currentFitHeight = !currentFitHeight;
        applyMode(currentFitHeight);
        showToast(`MODE: ${currentFitHeight ? "FIT HEIGHT" : "NATURAL WIDTH"}`);
        break;
      case "Q":
        location.href = ui.elGallery.href;
        break;
      case "ARROWUP":
      case "W":
        if (!currentFitHeight) {
          e.preventDefault();
          window.scrollBy(0, -SETTINGS.scrollStep);
        }
        break;
      case "ARROWDOWN":
      case "S":
        if (!currentFitHeight) {
          e.preventDefault();
          window.scrollBy(0, SETTINGS.scrollStep);
        }
        break;
      case "ARROWRIGHT":
      case "D":
        e.preventDefault();
        navigateTo(ui.elNext.dataset.href);
        break;
      case "ARROWLEFT":
      case "A":
        e.preventDefault();
        navigateTo(ui.elPrev.dataset.href);
        break;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
