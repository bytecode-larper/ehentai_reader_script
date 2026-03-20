import type { UserSettings } from "./types";

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  // User-facing (Menu)
  fitHeight: true,
  debug: false,
  smoothScroll: true,

  // Tunables (Internal)
  scrollStep: 220,
  prefetchCount: 2,
  maxNlRetry: 4,
  imgCacheLimit: 20,
};

// Global settings object
export const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  fitHeight: GM_getValue("fitHeight", DEFAULT_SETTINGS.fitHeight),
  debug: GM_getValue("debug", DEFAULT_SETTINGS.debug),
  smoothScroll: GM_getValue("smoothScroll", DEFAULT_SETTINGS.smoothScroll),
};

const TAG = "[EH-Reader]";
export const log = (...a: any[]) => SETTINGS.debug && console.log(TAG, ...a);
export const warn = (...a: any[]) => SETTINGS.debug && console.warn(TAG, ...a);

// Register menu commands for persistent settings
export function registerMenuCommands(onUpdate: () => void) {
  GM_registerMenuCommand(
    `Toggle Fit Mode: ${SETTINGS.fitHeight ? "Fit-Height" : "Natural-Width"}`,
    () => {
      SETTINGS.fitHeight = !SETTINGS.fitHeight;
      GM_setValue("fitHeight", SETTINGS.fitHeight);
      onUpdate();
      registerMenuCommands(onUpdate);
    },
  );

  GM_registerMenuCommand(
    `Toggle Smooth Scroll: ${SETTINGS.smoothScroll ? "ON" : "OFF"}`,
    () => {
      SETTINGS.smoothScroll = !SETTINGS.smoothScroll;
      GM_setValue("smoothScroll", SETTINGS.smoothScroll);
      registerMenuCommands(onUpdate);
    },
  );

  GM_registerMenuCommand(`Toggle Debug Mode: ${SETTINGS.debug ? "ON" : "OFF"}`, () => {
    SETTINGS.debug = !SETTINGS.debug;
    GM_setValue("debug", SETTINGS.debug);
    location.reload();
  });
}
