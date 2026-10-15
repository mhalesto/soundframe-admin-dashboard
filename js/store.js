// Application state, preferences and a tiny event bus.

const PREFS_KEY = "sfAdmin.prefs";
const READ_KEY = "sfAdmin.readNotifications";

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: preferences simply do not persist.
  }
}

const storedPrefs = readJSON(PREFS_KEY, {});

export const prefs = {
  sidebar: storedPrefs.sidebar === "rail" ? "rail" : "expanded",
  density: storedPrefs.density === "compact" ? "compact" : "comfortable",
  motion: ["reduced", "full"].includes(storedPrefs.motion) ? storedPrefs.motion : "system",
  range: typeof storedPrefs.range === "string" ? storedPrefs.range : "14d",
  customFrom: storedPrefs.customFrom || "",
  customTo: storedPrefs.customTo || "",
  compare: storedPrefs.compare === true,
  autoRefresh: storedPrefs.autoRefresh !== false,
  financeTab: storedPrefs.financeTab || "spend"
};

export function savePrefs(patch) {
  Object.assign(prefs, patch);
  writeJSON(PREFS_KEY, prefs);
  emit("prefs", patch);
}

export const state = {
  auth: "booting", // booting | signedout | locked | ready | error
  authError: "",
  user: null,
  status: null,
  dashboard: null,
  dashboardError: null,
  dashboardLoadedAt: 0,
  finance: null,
  financeError: null,
  financeLoadedAt: 0,
  financeLoading: false,
  loading: false,
  lastRefreshFailed: false,
  route: { name: "overview", params: new URLSearchParams() },
  subjectKinds: new Map() // quotaSubjectHash -> "internal-test" (verified in-browser by hash)
};

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => listeners.get(event)?.delete(handler);
}

export function emit(event, payload) {
  listeners.get(event)?.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[${event}] handler failed`, error);
    }
  });
}

// Notification read state is a per-browser convenience.
const readIDs = new Set(readJSON(READ_KEY, []));

export function isRead(id) {
  return readIDs.has(id);
}

export function markRead(ids) {
  ids.forEach((id) => readIDs.add(id));
  writeJSON(READ_KEY, Array.from(readIDs).slice(-300));
  emit("notifications-read");
}
