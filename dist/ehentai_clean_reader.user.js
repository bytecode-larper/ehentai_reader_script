// ==UserScript==
// @name         E-Hentai Clean Reader
// @namespace    https://e-hentai.org/
// @version      2.3.0
// @match        https://e-hentai.org/s/*/*
// @match        https://exhentai.org/s/*/*
// @grant        GM_addStyle
// ==/UserScript==

// src/parser.ts
function parseViewerDoc(doc, viewerUrl) {
  const [, pageHash = "", galleryId = "", rawNum = "1"] =
    viewerUrl.match(/\/s\/([^/]+)\/(\d+)-(\d+)/) ?? [];
  const pageNum = parseInt(rawNum, 10);
  const imgEl = doc.querySelector("#i3 a img, iframe + a img, .sni > a img");
  const imgSrc = imgEl?.getAttribute("src") ?? "";
  const nlToken =
    doc
      .querySelector('a[onclick*="nl("]')
      ?.getAttribute("onclick")
      ?.match(/nl\((\d+)\)/)?.[1] ?? null;
  const anchors = [...doc.querySelectorAll('a[href*="/s/"]')];
  const hrefMatching = (n) =>
    anchors.find((a) => a.href.match(new RegExp(`-(${n})(\\?|$)`)))?.href ?? null;
  const nextHref = (() => {
    const byNum = hrefMatching(pageNum + 1);
    if (byNum) {
      return byNum;
    }
    const i3 = doc.querySelector("#i3 a")?.href;
    return i3 && i3 !== viewerUrl ? i3 : null;
  })();
  const prevHref =
    pageNum <= 1
      ? null
      : (hrefMatching(pageNum - 1) ??
        (pageHash && galleryId
          ? `https://${location.host}/s/${pageHash}/${galleryId}-${pageNum - 1}`
          : null));
  const counterText =
    [...doc.querySelectorAll("div, span, td")]
      .find((el) => /^\d+ \/ \d+$/.test(el.textContent?.trim() ?? ""))
      ?.textContent?.trim() ?? `${pageNum} / ?`;
  const totalPages = parseInt(counterText.split("/")[1]?.trim() ?? "0", 10);
  const fileInfo = (() => {
    for (const el of doc.querySelector("#i2")?.querySelectorAll("div, span") ?? []) {
      const t = (el.textContent ?? "").trim();
      if (/\d+ x \d+/.test(t) && t.includes("::")) {
        return (
          t.split(`
`)[0] ?? t
        ).trim();
      }
    }
    return "";
  })();
  const galleryHref = doc.querySelector('a[href*="/g/"]')?.href ?? "#";
  return {
    viewerUrl,
    pageNum,
    counterText,
    totalPages,
    imgSrc,
    nextHref,
    prevHref,
    fileInfo,
    galleryHref,
    nlToken,
  };
}

// src/config.ts
const CONFIG = {
  DEBUG: true,
  PREFETCH_COUNT: 2,
  MAX_NL_RETRY: 4,
  IMG_CACHE_LIMIT: 10,
  SCROLL_STEP: 160,
};
const TAG = "[EH-Reader]";
const log = (...a) => CONFIG.DEBUG && console.log(TAG, ...a);
const warn = (...a) => CONFIG.DEBUG && console.warn(TAG, ...a);

// src/network.ts
const pageCache = new Map();
const imgCache = new Map();
let preloadContainer = null;
function ensurePreloadContainer() {
  if (preloadContainer) {
    return;
  }
  preloadContainer = Object.assign(document.createElement("div"), {
    style: "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none",
  });
  document.body.appendChild(preloadContainer);
}
function preloadImage(src) {
  if (imgCache.has(src)) {
    return imgCache.get(src);
  }
  if (imgCache.size >= CONFIG.IMG_CACHE_LIMIT) {
    const oldest = imgCache.keys().next().value;
    imgCache.get(oldest)?.remove();
    imgCache.delete(oldest);
    log("evicted preload", oldest);
  }
  ensurePreloadContainer();
  const img = document.createElement("img");
  img.onload = () => log("preload done", src);
  img.onerror = () => warn("preload error", src);
  img.src = src;
  preloadContainer.appendChild(img);
  imgCache.set(src, img);
  log("preloading", src);
  return img;
}
async function fetchViewerPage(viewerUrl) {
  if (pageCache.has(viewerUrl)) {
    log("viewer cache hit", viewerUrl);
    return pageCache.get(viewerUrl);
  }
  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include" });
  const html = await res.text();
  const data = parseViewerDoc(new DOMParser().parseFromString(html, "text/html"), viewerUrl);
  pageCache.set(viewerUrl, data);
  log("cached viewer", viewerUrl, "| img:", data.imgSrc, "| nl:", data.nlToken);
  return data;
}
async function fetchNlRetry(pageData) {
  if (!pageData.nlToken) {
    return null;
  }
  const retryUrl = `${pageData.viewerUrl.split("?")[0]}?nl=${pageData.nlToken}`;
  log("nl retry →", retryUrl);
  try {
    const res = await fetch(retryUrl, { credentials: "include" });
    const newData = parseViewerDoc(
      new DOMParser().parseFromString(await res.text(), "text/html"),
      pageData.viewerUrl
    );
    pageCache.set(pageData.viewerUrl, newData);
    return newData;
  } catch (e) {
    warn("nl retry fetch failed", e);
    return null;
  }
}
async function prefetchDirection(data, getNext) {
  let cur = data;
  for (let i = 0; i < CONFIG.PREFETCH_COUNT; i++) {
    const href = getNext(cur);
    if (!href) {
      break;
    }
    const next = await fetchViewerPage(href).catch(() => null);
    if (!next?.imgSrc) {
      break;
    }
    preloadImage(next.imgSrc);
    cur = next;
  }
}
function prefetchBoth(data) {
  prefetchDirection(data, (d) => d.nextHref).catch((e) => warn("prefetch forward error", e));
  prefetchDirection(data, (d) => d.prevHref).catch((e) => warn("prefetch backward error", e));
}

// src/ui.ts
function injectShell(initData) {
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
  return {
    elImg: document.getElementById("main-img"),
    elCounter: document.getElementById("hud-counter"),
    elFileInfo: document.getElementById("file-info"),
    elPrev: document.getElementById("nav-prev"),
    elNext: document.getElementById("nav-next"),
    elGallery: document.getElementById("hud-gallery"),
  };
}
function applyMode(fitHeight) {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
  const btn = document.getElementById("hud-fit");
  if (btn) {
    btn.textContent = fitHeight ? "fit H" : "natural";
  }
}
function displayImage(elImg, pageData, retryCount = 0) {
  elImg.onload = null;
  elImg.onerror = null;
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
    if (newData) {
      displayImage(elImg, newData, retryCount + 1);
    }
  };
  elImg.src = pageData.imgSrc;
}
function renderPage(ui, data, fitHeight) {
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
  if (!fitHeight) {
    window.scrollTo(0, 0);
  }
  log("rendered", data.counterText);
}

// src/main.ts
document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";
let pendingNav = null;
let isNavigating = false;
let fitHeight = true;
let ui;
async function navigateTo(url) {
  if (!url) {
    return;
  }
  pendingNav = url;
  if (isNavigating) {
    return;
  }
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
    } else {
      navigateTo(url);
    }
  });
  ui.elPrev.addEventListener("click", () => navigateTo(ui.elPrev.dataset.href));
  ui.elNext.addEventListener("click", () => navigateTo(ui.elNext.dataset.href));
  document.getElementById("hud-fit")?.addEventListener("click", () => {
    fitHeight = !fitHeight;
    applyMode(fitHeight);
  });
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
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
