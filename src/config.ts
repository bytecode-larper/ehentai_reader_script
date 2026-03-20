import type { UserSettings } from "./types";

// Default settings
const DEFAULT_SETTINGS: UserSettings = {
  // User-facing (Menu Preferences)
  fitHeight: true, // This is the "Default" for new loads
  debug: true,

  // Tunables (Internal)
  scrollStep: 220,
  prefetchCount: 2,
  maxNlRetry: 4,
  imgCacheLimit: 20,
};

// Global settings object
export const SETTINGS: UserSettings = {
  ...DEFAULT_SETTINGS,
  fitHeight: GM_getValue("defaultFitHeight", DEFAULT_SETTINGS.fitHeight),
  debug: GM_getValue("debug", DEFAULT_SETTINGS.debug),
};

const TAG = "[EH-Reader]";
export const log = (...a: any[]) => SETTINGS.debug && console.log(TAG, ...a);
export const warn = (...a: any[]) => SETTINGS.debug && console.warn(TAG, ...a);

export function registerMenuCommands(onUpdate: (newFit: boolean) => void) {
  GM_registerMenuCommand(
    `Default Mode: ${SETTINGS.fitHeight ? "Fit-Height" : "Natural-Width"}`,
    () => {
      SETTINGS.fitHeight = !SETTINGS.fitHeight;
      GM_setValue("defaultFitHeight", SETTINGS.fitHeight);
      onUpdate(SETTINGS.fitHeight);
      registerMenuCommands(onUpdate);
    },
  );

  GM_registerMenuCommand(`Debug Mode: ${SETTINGS.debug ? "Enabled" : "Disabled"}`, () => {
    SETTINGS.debug = !SETTINGS.debug;
    GM_setValue("debug", SETTINGS.debug);
    location.reload();
  });
}
