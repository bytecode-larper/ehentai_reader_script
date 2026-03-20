import { parseViewerDoc } from "./parser";
import { fetchViewerPage, prefetchBoth, pageCache } from "./network";
import { injectShell, renderPage, applyMode, showToast } from "./ui";
import type { UIRefs } from "./ui";
import { log, warn, SETTINGS, registerMenuCommands } from "./config";
import { ZoomController } from "./zoom";

document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";

let pendingNav: string | null = null;
let isNavigating = false;
let ui: UIRefs;
let zoom: ZoomController;

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
      zoom?.reset();
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
  zoom = new ZoomController(document.getElementById("reader")!, ui.elImg, () => currentFitHeight);

  applyMode(currentFitHeight);
  renderPage(ui, initData, currentFitHeight, true);
  prefetchBoth(initData);

  registerMenuCommands((newFit) => {
    currentFitHeight = newFit;
    zoom.updateZoom(null, currentFitHeight);
    applyMode(currentFitHeight);
  });

  document.documentElement.style.cssText = "";
  log("SPA ready");

  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      zoom.reset();
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } else navigateTo(url);
  });

  const reader = document.getElementById("reader");
  reader?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("#hud, #page-info")) return;
    if (zoom.wasPanned) return;

    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.4) {
      navigateTo(reader.dataset.prev);
    } else {
      navigateTo(reader.dataset.next);
    }
  });

  let mouseTimer: any = null;
  const hideCursor = () => document.body.classList.add("no-cursor");
  const showCursor = () => {
    document.body.classList.remove("no-cursor");
    if (mouseTimer) window.clearTimeout(mouseTimer);
    mouseTimer = window.setTimeout(hideCursor, 3000);
  };
  window.addEventListener("mousemove", showCursor);
  window.addEventListener("mousedown", showCursor);
  showCursor();

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toUpperCase();

    if (e.ctrlKey) {
      if (k === "=" || k === "+" || e.key === "+") {
        e.preventDefault();
        zoom.updateZoom(0.1, currentFitHeight);
        return;
      }
      if (k === "-" || k === "_" || e.key === "-") {
        e.preventDefault();
        zoom.updateZoom(-0.1, currentFitHeight);
        return;
      }
      if (k === "0") {
        e.preventDefault();
        zoom.updateZoom(null, currentFitHeight);
        return;
      }
    }

    if (mouseTimer) window.clearTimeout(mouseTimer);
    mouseTimer = window.setTimeout(hideCursor, 3000);

    if (zoom.handleKey(k, currentFitHeight)) return;

    switch (k) {
      case "F":
        currentFitHeight = !currentFitHeight;
        zoom.updateZoom(null, currentFitHeight);
        applyMode(currentFitHeight);
        showToast(`MODE: ${currentFitHeight ? "FIT HEIGHT" : "NATURAL WIDTH"}`);
        break;
      case "U":
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
        navigateTo(reader?.dataset.next);
        break;
      case "ARROWLEFT":
      case "A":
        e.preventDefault();
        navigateTo(reader?.dataset.prev);
        break;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
