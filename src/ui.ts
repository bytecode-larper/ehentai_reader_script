import type { PageData } from "./types";
import { imgCache, fetchNlRetry } from "./network";
import { log, warn, CONFIG } from "./config";
import shellHtml from "./shell.html" with { type: "text" };
import styles from "./style.css" with { type: "text" };

// UI element refs — populated by injectShell, exported for main.ts event wiring
export interface UIRefs {
  elImg: HTMLImageElement;
  elCounter: HTMLElement;
  elFileInfo: HTMLElement;
  elPrev: HTMLElement;
  elNext: HTMLElement;
  elGallery: HTMLAnchorElement;
}

export function injectShell(initData: PageData): UIRefs {
  document.body.innerHTML = shellHtml.replace('href=""', `href="${initData.galleryHref}"`);
  GM_addStyle(styles);

  // Return concrete refs — callers get typed, non-null elements
  // (injectShell is always called before any render, so these exist)
  return {
    elImg: document.getElementById("main-img") as HTMLImageElement,
    elCounter: document.getElementById("hud-counter") as HTMLElement,
    elFileInfo: document.getElementById("file-info") as HTMLElement,
    elPrev: document.getElementById("nav-prev") as HTMLElement,
    elNext: document.getElementById("nav-next") as HTMLElement,
    elGallery: document.getElementById("hud-gallery") as HTMLAnchorElement,
  };
}

export function applyMode(fitHeight: boolean): void {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
  const btn = document.getElementById("hud-fit");
  if (btn) btn.textContent = fitHeight ? "fit H" : "natural";
}

export function displayImage(elImg: HTMLImageElement, pageData: PageData, retryCount = 0): void {
  elImg.onload = null;
  elImg.onerror = null;

  // If preload <img> already finished, browser has it decoded — assign and paint
  const preloaded = imgCache.get(pageData.imgSrc);
  if (preloaded?.complete && preloaded.naturalWidth > 0) {
    log("instant from cache", pageData.imgSrc);
    elImg.src = pageData.imgSrc;
    return;
  }

  elImg.onload = () => log("image displayed", pageData.imgSrc);
  elImg.onerror = async () => {
    warn(`image failed (attempt ${retryCount + 1})`, pageData.imgSrc);
    if (retryCount >= CONFIG.MAX_NL_RETRY) {
      warn("giving up");
      return;
    }
    const newData = await fetchNlRetry(pageData);
    if (newData) displayImage(elImg, newData, retryCount + 1);
  };
  elImg.src = pageData.imgSrc;
}

export function renderPage(ui: UIRefs, data: PageData, fitHeight: boolean): void {
  ui.elCounter.textContent = data.counterText;
  ui.elFileInfo.textContent = data.fileInfo;
  ui.elGallery.href = data.galleryHref;
  document.title = `${data.counterText} - E-Hentai`;

  ui.elPrev.className = data.prevHref ? "" : "disabled";
  ui.elPrev.dataset.href = data.prevHref ?? "";
  ui.elNext.className = data.nextHref ? "" : "disabled";
  ui.elNext.dataset.href = data.nextHref ?? "";

  displayImage(ui.elImg, data);
  history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  if (!fitHeight) window.scrollTo(0, 0);
  log("rendered", data.counterText);
}
