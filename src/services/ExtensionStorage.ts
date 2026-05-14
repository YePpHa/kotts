type StorageAreaName = "local";

type StorageGetResult = Record<string, unknown>;

type BrowserStorageArea = {
  get: (keys?: string | string[] | Record<string, unknown> | null) => Promise<StorageGetResult>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

type ChromeStorageArea = {
  get: (
    keys: string | string[] | Record<string, unknown> | null | undefined,
    callback: (items: StorageGetResult) => void,
  ) => void;
  set: (items: Record<string, unknown>, callback?: () => void) => void;
  remove: (keys: string | string[], callback?: () => void) => void;
};

function getBrowserStorage(area: StorageAreaName): BrowserStorageArea | null {
  const anyGlobal = globalThis as unknown as { browser?: unknown };
  const browser = anyGlobal.browser as { storage?: Record<string, unknown> } | undefined;
  const storage = browser?.storage?.[area] as BrowserStorageArea | undefined;
  if (storage && typeof storage.get === "function" && typeof storage.set === "function") {
    return storage;
  }
  return null;
}

function getChromeStorage(area: StorageAreaName): ChromeStorageArea | null {
  const anyGlobal = globalThis as unknown as { chrome?: unknown };
  const chrome = anyGlobal.chrome as { storage?: Record<string, unknown> } | undefined;
  const storage = chrome?.storage?.[area] as ChromeStorageArea | undefined;
  if (storage && typeof storage.get === "function" && typeof storage.set === "function") {
    return storage;
  }
  return null;
}

export async function storageGet<T>(
  key: string,
  fallback: T,
  area: StorageAreaName = "local",
): Promise<T> {
  const browser = getBrowserStorage(area);
  if (browser) {
    const items = await browser.get({ [key]: fallback });
    return (items[key] as T) ?? fallback;
  }

  const chrome = getChromeStorage(area);
  if (chrome) {
    return await new Promise<T>((resolve) => {
      chrome.get({ [key]: fallback }, (items) => {
        resolve((items[key] as T) ?? fallback);
      });
    });
  }

  // Non-extension context fallback
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function storageSet<T>(
  key: string,
  value: T,
  area: StorageAreaName = "local",
): Promise<void> {
  const browser = getBrowserStorage(area);
  if (browser) {
    await browser.set({ [key]: value });
    return;
  }

  const chrome = getChromeStorage(area);
  if (chrome) {
    await new Promise<void>((resolve) => {
      chrome.set({ [key]: value }, () => resolve());
    });
    return;
  }

  // Non-extension context fallback
  localStorage.setItem(key, JSON.stringify(value));
}

export async function storageRemove(key: string, area: StorageAreaName = "local"): Promise<void> {
  const browser = getBrowserStorage(area);
  if (browser) {
    await browser.remove(key);
    return;
  }

  const chrome = getChromeStorage(area);
  if (chrome) {
    await new Promise<void>((resolve) => {
      chrome.remove(key, () => resolve());
    });
    return;
  }

  localStorage.removeItem(key);
}
