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
  const nextHref =
    (hrefMatching(pageNum + 1) ?? doc.querySelector("#i3 a")?.href !== viewerUrl)
      ? doc.querySelector("#i3 a")?.href
      : null;
  const prevHref =
    pageNum <= 1
      ? null
      : (hrefMatching(pageNum - 1) ??
        (pageHash && galleryId
          ? `https://${location.host}/s/${pageHash}/${galleryId}-${pageNum - 1}`
          : null));
  const counterText =
    [...doc.querySelectorAll("div, span, td")]
      .find((el) => /^\d+ \/ \d+$/.test(el.textContent?.trim() || ""))
      ?.textContent?.trim() ?? `${pageNum} / ?`;
  const totalPages = parseInt(counterText.split("/")[1]?.trim() ?? "0", 10);
  const fileInfo = (() => {
    for (const el of doc.querySelector("#i2")?.querySelectorAll("div, span") ?? []) {
      const t = el.textContent?.trim() || "";
      if (/\d+ x \d+/.test(t) && t.includes("::")) {
        return t
          .split(
            `
`,
          )[0]
          .trim();
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
  }
  ensurePreloadContainer();
  const img = document.createElement("img");
  img.onload = () => log("preload done", src);
  img.onerror = () => warn("preload error", src);
  img.src = src;
  preloadContainer.appendChild(img);
  imgCache.set(src, img);
  return img;
}
async function fetchViewerPage(viewerUrl) {
  if (pageCache.has(viewerUrl)) {
    return pageCache.get(viewerUrl);
  }
  log("fetching viewer →", viewerUrl);
  const res = await fetch(viewerUrl, { credentials: "include" });
  const html = await res.text();
  const data = parseViewerDoc(new DOMParser().parseFromString(html, "text/html"), viewerUrl);
  pageCache.set(viewerUrl, data);
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
      pageData.viewerUrl,
    );
    pageCache.set(pageData.viewerUrl, newData);
    return newData;
  } catch (e) {
    warn("nl retry fetch failed", e);
    return null;
  }
}
async function prefetchBoth(data) {
  const prefetchDirection = async (getNext) => {
    let cur = data;
    for (let i = 0; i < CONFIG.PREFETCH_COUNT; i++) {
      const href = getNext(cur);
      if (!href) {
        break;
      }
      const nextData = await fetchViewerPage(href).catch(() => null);
      if (!nextData?.imgSrc) {
        break;
      }
      preloadImage(nextData.imgSrc);
      cur = nextData;
    }
  };
  prefetchDirection((d) => d.nextHref);
  prefetchDirection((d) => d.prevHref);
}

// src/ui.ts
const UI = {
  elImg: null,
  elCounter: null,
  elBottomCounter: null,
  elFileInfo: null,
  elPrev: null,
  elNext: null,
  elGallery: null,
};
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
  UI.elImg = document.getElementById("main-img");
  UI.elCounter = document.getElementById("hud-counter");
  UI.elBottomCounter = document.getElementById("bottom-counter");
  UI.elFileInfo = document.getElementById("file-info");
  UI.elPrev = document.getElementById("nav-prev");
  UI.elNext = document.getElementById("nav-next");
  UI.elGallery = document.getElementById("hud-gallery");
}
function applyMode(fitHeight) {
  document.body.classList.toggle("fit-h", fitHeight);
  document.body.classList.toggle("fit-w", !fitHeight);
  const btn = document.getElementById("hud-fit");
  if (btn) {
    btn.textContent = fitHeight ? "fit H" : "natural";
  }
}
function displayImage(pageData, retryCount = 0) {
  if (!UI.elImg) {
    return;
  }
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
    if (retryCount >= CONFIG.MAX_NL_RETRY) {
      return;
    }
    const newData = await fetchNlRetry(pageData);
    if (newData) {
      displayImage(newData, retryCount + 1);
    }
  };
  UI.elImg.src = pageData.imgSrc;
}
function renderPage(data, fitHeight) {
  if (!UI.elCounter) {
    return;
  }
  UI.elCounter.textContent = data.counterText;
  UI.elBottomCounter.textContent = data.counterText;
  UI.elFileInfo.textContent = data.fileInfo;
  UI.elGallery.href = data.galleryHref;
  UI.elPrev.className = data.prevHref ? "" : "disabled";
  UI.elPrev.dataset.href = data.prevHref ?? "";
  UI.elNext.className = data.nextHref ? "" : "disabled";
  UI.elNext.dataset.href = data.nextHref ?? "";
  displayImage(data);
  history.pushState({ viewerUrl: data.viewerUrl }, "", data.viewerUrl);
  if (!fitHeight) {
    window.scrollTo(0, 0);
  }
}

// src/main.ts
document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";
new MutationObserver((mutations, obs) => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (node.nodeName === "SCRIPT") {
        node.remove();
      }
    }
  }
  if (document.readyState === "interactive" || document.readyState === "complete") {
    obs.disconnect();
  }
}).observe(document.documentElement, { childList: true, subtree: true });
let pendingNav = null;
let isNavigating = false;
let fitHeight = true;
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
  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      renderPage(data, fitHeight);
      prefetchBoth(data);
    } else {
      navigateTo(url);
    }
  });
  UI.elPrev?.addEventListener("click", () => navigateTo(UI.elPrev?.dataset.href));
  UI.elNext?.addEventListener("click", () => navigateTo(UI.elNext?.dataset.href));
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
