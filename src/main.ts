import { parseViewerDoc } from "./parser";
import { fetchViewerPage, prefetchBoth, pageCache } from "./network";
import { injectShell, renderPage, applyMode, showToast } from "./ui";
import type { UIRefs } from "./ui";
import { log, warn, SETTINGS, registerMenuCommands } from "./config";

document.documentElement.style.cssText = "visibility:hidden!important;background:#111!important";

let pendingNav: string | null = null;
let isNavigating = false;
let ui: UIRefs;

// session state: current mode for this tab/gallery
let currentFitHeight = SETTINGS.fitHeight;
let zoomLevel = 1.0;
let zoomSnapTimer: any = null;
let panX = 0;
let panY = 0;
let isDragging = false;
let startX = 0;
let startY = 0;
let hasMoved = false;

function updateTransform() {
  if (ui?.elImg) {
    // Calculate limits based on scaled dimensions vs viewport
    const imgWidth = ui.elImg.clientWidth;
    const imgHeight = ui.elImg.clientHeight;
    const scaledWidth = imgWidth * zoomLevel;
    const scaledHeight = imgHeight * zoomLevel;

    const limitX = Math.max(0, (scaledWidth - window.innerWidth) / 2);
    const limitY = Math.max(0, (scaledHeight - window.innerHeight) / 2);

    panX = Math.max(-limitX, Math.min(panX, limitX));
    panY = Math.max(-limitY, Math.min(panY, limitY));

    ui.elImg.style.transform =
      zoomLevel === 1.0 && panX === 0 && panY === 0
        ? ""
        : `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
  }
}

function updateZoom(delta: number | null) {
  // Allow reset (null) regardless of mode, but guard actual zooming
  if (delta !== null && !currentFitHeight) return;

  if (delta === null) {
    resetZoom();
  } else {
    zoomLevel = Math.max(0.7, Math.min(5.0, zoomLevel + delta));
    updateTransform();
    showToast(`ZOOM: ${Math.round(zoomLevel * 100)}%`);
  }

  // Rubber band logic: faster snap back (200ms)
  if (zoomSnapTimer) window.clearTimeout(zoomSnapTimer);
  if (zoomLevel < 1.0) {
    zoomSnapTimer = window.setTimeout(() => {
      resetZoom();
      showToast("ZOOM: 100%");
    }, 200);
  }
}

function resetZoom() {
  zoomLevel = 1.0;
  panX = 0;
  panY = 0;
  updateTransform();
}

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
      resetZoom();
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
  applyMode(currentFitHeight);
  renderPage(ui, initData, currentFitHeight, true);
  prefetchBoth(initData);

  // Initialize menu commands
  registerMenuCommands((newFit) => {
    currentFitHeight = newFit;
    if (!currentFitHeight) updateZoom(null);
    applyMode(currentFitHeight);
  });

  // Always clear — even if DOMContentLoaded already fired or was missed
  document.documentElement.style.cssText = "";
  log("SPA ready");

  window.addEventListener("popstate", (e) => {
    const url = e.state?.viewerUrl ?? location.href;
    const data = pageCache.get(url);
    if (data) {
      resetZoom();
      renderPage(ui, data, currentFitHeight);
      prefetchBoth(data);
    } else navigateTo(url);
  });

  // Click-to-navigate & Drag-to-pan logic
  const reader = document.getElementById("reader");

  reader?.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest("#hud, #page-info")) return;
    e.preventDefault(); // Stop browser image ghost/drag behavior
    if (zoomLevel > 1.0) {
      isDragging = true;
      hasMoved = false;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      reader.style.cursor = "grabbing";
      if (ui?.elImg) ui.elImg.classList.add("no-transition");
    }
  });

  window.addEventListener("mousemove", (e) => {
    showCursor();
    if (isDragging) {
      const newPanX = e.clientX - startX;
      const newPanY = e.clientY - startY;
      if (Math.abs(newPanX - panX) > 2 || Math.abs(newPanY - panY) > 2) {
        hasMoved = true;
      }
      panX = newPanX;
      panY = newPanY;
      updateTransform();
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      if (reader) reader.style.cursor = "pointer";
      if (ui?.elImg) ui.elImg.classList.remove("no-transition");
    }
  });

  reader?.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("#hud, #page-info")) return;
    if (hasMoved) return; // Block navigation if we just panned

    const x = e.clientX;
    const width = window.innerWidth;
    if (x < width * 0.4) {
      navigateTo(reader.dataset.prev);
    } else {
      navigateTo(reader.dataset.next);
    }
  });

  // Cursor auto-hide logic
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

  // Ctrl + Scroll to zoom
  window.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        updateZoom(e.deltaY < 0 ? 0.1 : -0.1);
      }
    },
    { passive: false },
  );

  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key.toUpperCase();

    // Handle Ctrl + Zoom
    if (e.ctrlKey) {
      if (k === "=" || k === "+" || e.key === "+") {
        e.preventDefault();
        updateZoom(0.1);
        return;
      }
      if (k === "-" || k === "_" || e.key === "-") {
        e.preventDefault();
        updateZoom(-0.1);
        return;
      }
      if (k === "0") {
        e.preventDefault();
        updateZoom(null);
        return;
      }
    }

    // Reset auto-hide timer without showing cursor
    if (mouseTimer) window.clearTimeout(mouseTimer);
    mouseTimer = window.setTimeout(hideCursor, 3000);

    switch (k) {
      case "F":
        currentFitHeight = !currentFitHeight;
        if (!currentFitHeight) updateZoom(null); // Reset zoom when leaving Fit-Height
        applyMode(currentFitHeight);
        showToast(`MODE: ${currentFitHeight ? "FIT HEIGHT" : "NATURAL WIDTH"}`);
        break;
      case "U":
        location.href = ui.elGallery.href;
        break;
      case "ARROWUP":
      case "W":
        if (currentFitHeight && zoomLevel > 1.0) {
          panY += SETTINGS.scrollStep;
          updateTransform();
        } else if (!currentFitHeight) {
          e.preventDefault();
          window.scrollBy(0, -SETTINGS.scrollStep);
        }
        break;
      case "ARROWDOWN":
      case "S":
        if (currentFitHeight && zoomLevel > 1.0) {
          panY -= SETTINGS.scrollStep;
          updateTransform();
        } else if (!currentFitHeight) {
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
