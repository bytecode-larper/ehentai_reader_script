import type { PageData } from "./types";
import { imgCache, fetchNlRetry } from "./network";
import { log, warn, SETTINGS } from "./config";
import shellHtml from "./shell.html" with { type: "text" };
import styles from "./style.css" with { type: "text" };

// UI element refs — populated by injectShell, exported for main.ts event wiring
export interface UIRefs {
  elImg: HTMLImageElement;
  elTitle: HTMLElement;
  elCounter: HTMLElement;
  elFileInfo: HTMLElement;
  elPrev: HTMLElement;
  elNext: HTMLElement;
  elGallery: HTMLAnchorElement;
}

export function injectShell(initData: PageData): UIRefs {
  document.body.innerHTML = shellHtml.replace('href=""', `href="${initData.galleryHref}"`);
  GM_addStyle(styles);

  const ui: UIRefs = {
    elImg: document.getElementById("main-img") as HTMLImageElement,
    elTitle: document.getElementById("hud-title") as HTMLElement,
    elCounter: document.getElementById("hud-counter") as HTMLElement,
    elFileInfo: document.getElementById("file-info") as HTMLElement,
    elPrev: document.getElementById("nav-prev") as HTMLElement,
    elNext: document.getElementById("nav-next") as HTMLElement,
    elGallery: document.getElementById("hud-gallery") as HTMLAnchorElement,
  };

  // Dynamically adjust title width to avoid overlapping the image
  const updateTitleWidth = () => {
    const imgWidth = ui.elImg.clientWidth;
    const viewportWidth = window.innerWidth;
    const gutter = (viewportWidth - imgWidth) / 2;
    // Aim for the gutter, but keep a minimum of 200px so it's readable if overlapping
    ui.elTitle.style.maxWidth = `${Math.max(200, gutter - 30)}px`;
  };

  new ResizeObserver(updateTitleWidth).observe(document.body);
  new ResizeObserver(updateTitleWidth).observe(ui.elImg);

  return ui;
}

export function applyMode(fitHeight: boolean): void {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
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
    if (retryCount >= SETTINGS.maxNlRetry) {
      warn("giving up");
      return;
    }
    const newData = await fetchNlRetry(pageData);
    if (newData) displayImage(elImg, newData, retryCount + 1);
  };
  elImg.src = pageData.imgSrc;
}

export function renderPage(
  ui: UIRefs,
  data: PageData,
  fitHeight: boolean,
  isInitial = false,
): void {
  ui.elTitle.textContent = data.galleryTitle;
  ui.elCounter.textContent = data.counterText;
  ui.elFileInfo.textContent = data.fileInfo;
  ui.elGallery.href = data.galleryHref;

  ui.elPrev.className = data.prevHref ? "" : "disabled";
  ui.elPrev.dataset.href = data.prevHref ?? "";
  ui.elNext.className = data.nextHref ? "" : "disabled";
  ui.elNext.dataset.href = data.nextHref ?? "";

  displayImage(ui.elImg, data);
  if (!isInitial) history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  if (!fitHeight) window.scrollTo(0, 0);
  log("rendered", data.counterText);
}
