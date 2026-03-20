import { parseViewerDoc } from "./parser";
import { fetchViewerPage, prefetchBoth, pageCache } from "./network";
import { injectShell, renderPage, applyMode } from "./ui";
import type { UIRefs } from "./ui";
import { log, warn, CONFIG } from "./config";

document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";

let pendingNav: string | null = null;
let isNavigating = false;
let fitHeight = true;
let ui: UIRefs;

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
      renderPage(ui, data, fitHeight);
      prefetchBoth(data);
    } catch (e) {
      warn("navigation failed", target, e);
    }
    isNavigating = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  log("DOMContentLoaded");

  const initData = parseViewerDoc(document, location.href);
  pageCache.set(location.href, initData);

  ui = injectShell(initData);
  applyMode(fitHeight);
  renderPage(ui, initData, fitHeight);
  prefetchBoth(initData);

  document.documentElement.style.cssText = "";
  log("SPA ready");

  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      renderPage(ui, data, fitHeight);
      prefetchBoth(data);
    } else navigateTo(url);
  });

  ui.elPrev.addEventListener("click", () => navigateTo(ui.elPrev.dataset.href));
  ui.elNext.addEventListener("click", () => navigateTo(ui.elNext.dataset.href));

  document.getElementById("hud-fit")?.addEventListener("click", () => {
    fitHeight = !fitHeight;
    applyMode(fitHeight);
  });

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case "f":
      case "F":
        fitHeight = !fitHeight;
        applyMode(fitHeight);
        break;
      case "ArrowUp":
      case "w":
      case "W":
        if (!fitHeight) {
          e.preventDefault();
          window.scrollBy({ top: -CONFIG.SCROLL_STEP, behavior: "smooth" });
        }
        break;
      case "ArrowDown":
      case "s":
      case "S":
        if (!fitHeight) {
          e.preventDefault();
          window.scrollBy({ top: CONFIG.SCROLL_STEP, behavior: "smooth" });
        }
        break;
      case "ArrowRight":
      case "d":
      case "D":
        e.preventDefault();
        navigateTo(ui.elNext.dataset.href);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        navigateTo(ui.elPrev.dataset.href);
        break;
    }
  });
});
