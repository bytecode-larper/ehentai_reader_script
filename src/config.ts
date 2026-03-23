import type { UserSettings, KeyMap } from "./types";

const DEFAULT_KEYMAP: KeyMap = {
  next: ["D", "ARROWRIGHT"],
  prev: ["A", "ARROWLEFT"],
  fit: ["F"],
  gallery: ["Q"],
  up: ["W", "ARROWUP"],
  down: ["S", "ARROWDOWN"],
};

const DEFAULT_SETTINGS: UserSettings = {
  fitHeight: true,
  debug: false,
  scrollStep: 220,
  prefetchCount: 2,
  maxNlRetry: 4,
  imgCacheLimit: 20,
  keymap: DEFAULT_KEYMAP,
};

// Explicitly handle defaults and ensure they are saved to storage if missing
function loadSettings(): UserSettings {
  const settings = {
    ...DEFAULT_SETTINGS,
    fitHeight: GM_getValue("defaultFitHeight", DEFAULT_SETTINGS.fitHeight),
    debug: GM_getValue("debug", DEFAULT_SETTINGS.debug),
    keymap: GM_getValue("keymap", DEFAULT_SETTINGS.keymap),
  };

  // If keymap is missing in storage, save the default so it appears in the Value tab
  if (!GM_getValue("keymap")) {
    GM_setValue("keymap", DEFAULT_KEYMAP);
  }

  return settings;
}

export const SETTINGS = loadSettings();

const TAG = "[EH-Reader]";
export const log = (...a: any[]) => SETTINGS.debug && console.log(TAG, ...a);
export const warn = (...a: any[]) => SETTINGS.debug && console.warn(TAG, ...a);

export function isKey(e: KeyboardEvent, action: keyof KeyMap): boolean {
  const k = e.key.toUpperCase();
  return SETTINGS.keymap[action].includes(k);
}

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

  GM_registerMenuCommand("Reset Keymap to Defaults", () => {
    if (confirm("Reset all keys to defaults (WASD/Arrows/F/Q)?")) {
      GM_setValue("keymap", DEFAULT_KEYMAP);
      location.reload();
    }
  });
}
