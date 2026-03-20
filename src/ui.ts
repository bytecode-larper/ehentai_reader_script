import type { PageData } from "./types";
import { imgCache, fetchNlRetry } from "./network";
import { log, warn, CONFIG } from "./config";

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
  document.body.innerHTML = `
    <div id="reader">
      <span id="img-wrap"><img id="main-img" src="" alt=""></span>
      <div id="hud">
        <a id="hud-gallery" href="${initData.galleryHref}" title="Back to gallery">&#8617;</a>
        <span id="hud-counter"></span>
        <button id="hud-fit" title="Toggle fit (F)">fit&nbsp;H</button>
      </div>
      <span id="nav-prev" class="disabled">&#8592;</span>
      <span id="nav-next" class="disabled">&#8594;</span>
      <div id="file-info"></div>
    </div>`;

  GM_addStyle(`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #111; color: #ccc; font: 13px/1 system-ui, sans-serif; height: 100%; }

    body.fit-h { overflow: hidden; }
    body.fit-h #reader { position: relative; display: flex; align-items: center; justify-content: center; width: 100vw; height: 100vh; overflow: hidden; }
    body.fit-h #img-wrap { display: flex; align-items: center; justify-content: center; }
    body.fit-h #main-img { max-height: 100vh; max-width: 100vw; width: auto; height: 100vh; object-fit: contain; }

    body.fit-w { overflow-y: auto; overflow-x: hidden; }
    body.fit-w #reader { position: relative; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; width: 100%; }
    body.fit-w #img-wrap { display: block; }
    body.fit-w #main-img { display: block; max-width: 100vw; height: auto; }

    #main-img { user-select: none; -webkit-user-drag: none; }

    #hud { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: linear-gradient(to bottom, rgba(0,0,0,.7) 0%, transparent 100%); opacity: 0; transition: opacity 0.2s; z-index: 10; }
    body:hover #hud { opacity: 1; }
    #hud-gallery { color: #aaa; text-decoration: none; font-size: 18px; line-height: 1; }
    #hud-gallery:hover { color: #fff; }
    #hud-counter { flex: 1; text-align: center; font-size: 13px; color: #999; letter-spacing: .04em; }
    #hud-fit { background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15); color: #ccc; padding: 3px 9px; border-radius: 4px; cursor: pointer; font-size: 12px; }
    #hud-fit:hover { background: rgba(255,255,255,.18); color: #fff; }

    #nav-prev, #nav-next { position: fixed; top: 50%; transform: translateY(-50%); font-size: 28px; color: rgba(255,255,255,0); padding: 20px 16px; transition: color 0.15s; z-index: 10; user-select: none; cursor: pointer; }
    #nav-prev { left: 0; } #nav-next { right: 0; }
    #nav-prev.disabled, #nav-next.disabled { cursor: default; pointer-events: none; }
    #nav-prev.loading, #nav-next.loading { color: rgba(255,255,255,.15) !important; }
    body:hover #nav-prev:not(.disabled):not(.loading),
    body:hover #nav-next:not(.disabled):not(.loading) { color: rgba(255,255,255,.3); }
    #nav-prev:not(.disabled):not(.loading):hover,
    #nav-next:not(.disabled):not(.loading):hover { color: rgba(255,255,255,.9) !important; }

    #file-info { position: fixed; bottom: 10px; right: 14px; font-size: 11px; color: rgba(255,255,255,.25); white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.2s; z-index: 10; }
    body:hover #file-info { opacity: 1; }
  `);

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
