export const CONFIG = {
  DEBUG: true,
  PREFETCH_COUNT: 2,
  MAX_NL_RETRY: 4,
  IMG_CACHE_LIMIT: 20,
  SCROLL_STEP: 160,
};

const TAG = "[EH-Reader]";
export const log = (...a: any[]) => CONFIG.DEBUG && console.log(TAG, ...a);
export const warn = (...a: any[]) => CONFIG.DEBUG && console.warn(TAG, ...a);
