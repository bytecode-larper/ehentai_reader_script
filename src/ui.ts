import { PageData } from "./types";
import { imgCache, fetchNlRetry } from "./network";
import { log, warn, CONFIG } from "./config";

export const UI = {
  elImg: null as HTMLImageElement | null,
  elCounter: null as HTMLElement | null,
  elBottomCounter: null as HTMLElement | null,
  elFileInfo: null as HTMLElement | null,
  elPrev: null as HTMLElement | null,
  elNext: null as HTMLElement | null,
  elGallery: null as HTMLAnchorElement | null,
};

export function injectShell(initData: PageData) {
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
      <div id="bottom-counter"></div>
      <div id="file-info"></div>
    </div>`;

  GM_addStyle(`
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #111; color: #ccc; font: 13px/1 system-ui, sans-serif; height: 100%; }
    /* ... The rest of your CSS ... */
    body.fit-h { overflow: hidden; }
    body.fit-h #main-img { max-height: 100vh; max-width: 100vw; width: auto; height: 100vh; object-fit: contain; }
    body.fit-w { overflow-y: auto; overflow-x: hidden; }
    body.fit-w #main-img { display: block; max-width: 100vw; height: auto; }
  `);

  UI.elImg = document.getElementById("main-img") as HTMLImageElement;
  UI.elCounter = document.getElementById("hud-counter");
  UI.elBottomCounter = document.getElementById("bottom-counter");
  UI.elFileInfo = document.getElementById("file-info");
  UI.elPrev = document.getElementById("nav-prev");
  UI.elNext = document.getElementById("nav-next");
  UI.elGallery = document.getElementById("hud-gallery") as HTMLAnchorElement;
}

export function applyMode(fitHeight: boolean) {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
  const btn = document.getElementById("hud-fit");
  if (btn) btn.textContent = fitHeight ? "fit H" : "natural";
}

export function displayImage(pageData: PageData, retryCount = 0) {
  if (!UI.elImg) return;
  UI.elImg.onload = null;
  UI.elImg.onerror = null;

  const preloaded = imgCache.get(pageData.imgSrc);
  if (preloaded?.complete && preloaded.naturalWidth > 0) {
    UI.elImg.src = pageData.imgSrc;
    return;
  }

  UI.elImg.onload = () => log("image displayed", pageData.imgSrc);
  UI.elImg.onerror = async () => {
    warn(`image failed (attempt ${retryCount + 1})`, pageData.imgSrc);
    if (retryCount >= CONFIG.MAX_NL_RETRY) return;
    const newData = await fetchNlRetry(pageData);
    if (newData) displayImage(newData, retryCount + 1);
  };
  UI.elImg.src = pageData.imgSrc;
}

export function renderPage(data: PageData, fitHeight: boolean) {
  if (!UI.elCounter) return;
  UI.elCounter.textContent = data.counterText;
  UI.elBottomCounter!.textContent = data.counterText;
  UI.elFileInfo!.textContent = data.fileInfo;
  UI.elGallery!.href = data.galleryHref;

  UI.elPrev!.className = data.prevHref ? "" : "disabled";
  UI.elPrev!.dataset.href = data.prevHref ?? "";
  UI.elNext!.className = data.nextHref ? "" : "disabled";
  UI.elNext!.dataset.href = data.nextHref ?? "";

  displayImage(data);
  history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  if (!fitHeight) window.scrollTo(0, 0);
}
