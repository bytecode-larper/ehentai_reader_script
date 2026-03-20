import type { PageData, ParsedTitle } from "./types";
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
  elGallery: HTMLAnchorElement;
  // Note: Previous and Next navigation elements are removed from DOM, 
  // but their logic is preserved via full-screen click zones and data-href storage.
}

export function injectShell(initData: PageData): UIRefs {
  document.body.innerHTML = shellHtml.replace('href=""', `href="${initData.galleryHref}"`);
  GM_addStyle(styles);

  const ui: UIRefs = {
    elImg: document.getElementById("main-img") as HTMLImageElement,
    elTitle: document.getElementById("hud-title") as HTMLElement,
    elCounter: document.getElementById("hud-counter") as HTMLElement,
    elFileInfo: document.getElementById("file-info") as HTMLElement,
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

let toastTimer: number | null = null;
export function showToast(text: string): void {
  const el = document.getElementById("hud-toast");
  if (!el) return;
  
  el.textContent = text;
  el.classList.add("show");

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("show");
  }, 1200);
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

function renderTitle(title: ParsedTitle): string {
  const formatMeta = (m: { text: string; type: string }) => {
    let content = m.text;
    // Highlight (Artist) within [Group (Artist)]
    if (m.type === "artist") {
      content = content.replace(/\(([^)]+)\)/, "<span>($1)</span>");
    }
    return `<span class="meta-item meta-${m.type}">${content}</span>`;
  };

  const leading = title.leading.map(formatMeta).join("");
  const trailing = title.trailing.map(formatMeta).join("");

  const main = `<span class="title-primary">${title.primary}</span>`;
  const sub = title.secondary
    ? `<span class="title-sep"> | </span><span class="title-secondary">${title.secondary}</span>`
    : "";

  return `
    <div class="title-meta-wrap leading">${leading}</div>
    <div class="title-main">${main}${sub}</div>
    <div class="title-meta-wrap trailing">${trailing}</div>
  `.trim();
}

export function renderPage(
  ui: UIRefs,
  data: PageData,
  fitHeight: boolean,
  isInitial = false,
): void {
  ui.elTitle.innerHTML = renderTitle(data.galleryTitle);
  ui.elCounter.textContent = data.counterText;
  ui.elFileInfo.textContent = data.fileInfo;
  ui.elGallery.href = data.galleryHref;

  // Since elPrev/elNext elements are gone, we use the reader container's 
  // data attributes to store current nav state for the click listener.
  const reader = document.getElementById("reader");
  if (reader) {
    reader.dataset.prev = data.prevHref ?? "";
    reader.dataset.next = data.nextHref ?? "";
  }

  displayImage(ui.elImg, data);
  if (!isInitial) history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  if (!fitHeight) window.scrollTo(0, 0);
  log("rendered", data.counterText);
}
