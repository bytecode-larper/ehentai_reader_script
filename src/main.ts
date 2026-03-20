import { parseViewerDoc } from "./parser";
import { fetchViewerPage, prefetchBoth, pageCache } from "./network";
import { injectShell, renderPage, applyMode, UI } from "./ui";
import { log, warn, CONFIG } from "./config";

// Early block before paint
document.documentElement.style.cssText =
  "visibility:hidden!important;background:#111!important";
new MutationObserver((mutations, obs) => {
  for (const { addedNodes } of mutations)
    for (const node of addedNodes)
      if (node.nodeName === "SCRIPT") node.remove();
  if (
    document.readyState === "interactive" ||
    document.readyState === "complete"
  )
    obs.disconnect();
}).observe(document.documentElement, { childList: true, subtree: true });

let pendingNav: string | null = null;
let isNavigating = false;
let fitHeight = true;

async function navigateTo(url: string | undefined | null) {
  if (!url) return;
  pendingNav = url;
  if (isNavigating) return;

  while (pendingNav) {
    const target = pendingNav;
    pendingNav = null;
    isNavigating = true;
    try {
      const data = await fetchViewerPage(target);
      renderPage(data, fitHeight);
      prefetchBoth(data);
    } catch (e) {
      warn("navigation failed", target, e);
    }
    isNavigating = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const initData = parseViewerDoc(document, location.href);
  pageCache.set(location.href, initData);

  injectShell(initData);
  applyMode(fitHeight);
  renderPage(initData, fitHeight);
  prefetchBoth(initData);

  document.documentElement.style.cssText = "";
  log("SPA ready");

  // Events
  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      renderPage(data, fitHeight);
      prefetchBoth(data);
    } else navigateTo(url);
  });

  UI.elPrev?.addEventListener("click", () =>
    navigateTo(UI.elPrev?.dataset.href),
  );
  UI.elNext?.addEventListener("click", () =>
    navigateTo(UI.elNext?.dataset.href),
  );
  document.getElementById("hud-fit")?.addEventListener("click", () => {
    fitHeight = !fitHeight;
    applyMode(fitHeight);
  });

  document.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
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
        navigateTo(UI.elNext?.dataset.href);
        break;
      case "ArrowLeft":
      case "a":
      case "A":
        e.preventDefault();
        navigateTo(UI.elPrev?.dataset.href);
        break;
    }
  });
});
