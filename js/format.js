// Formatting, labels and safe HTML templating. Every interpolated value is escaped unless wrapped in raw().

export class Raw {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

export function raw(value) {
  return value instanceof Raw ? value : new Raw(String(value ?? ""));
}

export function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stringify(value) {
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(stringify).join("");
  if (value === null || value === undefined || value === false) return "";
  return escapeHTML(value);
}

/** Tagged template: html`<b>${userText}</b>` escapes userText; nest html`` or raw() for markup. */
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, index) => {
    out += stringify(value) + strings[index + 1];
  });
  return new Raw(out);
}

// ---------- Numbers ----------
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function number(value) {
  return integer.format(Number(value) || 0);
}

export function compact(value) {
  const amount = Number(value) || 0;
  return Math.abs(amount) >= 10000 ? compactNumber.format(amount) : integer.format(amount);
}

/** Money for balances and totals: cents, with up to four decimals for sub-dollar unit costs. */
export function money(value, options = {}) {
  const amount = Number(value) || 0;
  if (options.compact && Math.abs(amount) >= 10000) {
    return `$${compactNumber.format(amount)}`;
  }
  const precise = amount !== 0 && Math.abs(amount) < 1 && !options.cents;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 4 : 2
  }).format(amount);
}

/** Unit costs (per request, per generation): up to four decimals. */
export function unitMoney(value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(amount) < 1 ? 4 : 2
  }).format(amount);
}

export function percent(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${number(count)} ${Number(count) === 1 ? singular : pluralForm}`;
}

export function ratioPercent(used, limit) {
  const usedValue = Number(used) || 0;
  const limitValue = Number(limit) || 0;
  if (limitValue <= 0) return usedValue > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, Math.round((usedValue / limitValue) * 100)));
}

// ---------- Time ----------
export function timeAgo(timestamp, now = Date.now()) {
  const time = typeof timestamp === "number" ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(time)) return "never";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDay(value, options = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC", ...(options.year ? { year: "numeric" } : {}) });
}

export function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export function monthLabel(periodKey) {
  const [year, month] = String(periodKey || "").split("-").map(Number);
  if (!year || !month) return periodKey || "Current period";
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function previousPeriodKey(period) {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- Identity ----------
export function shortID(value, length = 8) {
  const text = String(value || "");
  if (!text) return "";
  return text.length <= length * 2 + 1 ? text : `${text.slice(0, length)}…${text.slice(-4)}`;
}

export function accountLabel(user) {
  return user?.email || user?.displayName || (user?.uid ? `User ${shortID(user.uid, 6)}` : "Unknown user");
}

export function accountMeta(user) {
  if (user?.email && user?.displayName) return user.displayName;
  return authProviderLabel(user?.authProvider);
}

export function authProviderLabel(value) {
  const text = String(value || "");
  if (!text) return "Firebase Auth";
  if (text === "anonymous") return "Anonymous";
  return text.split(",").map((part) => ({
    "apple.com": "Sign in with Apple",
    "google.com": "Google",
    password: "Email",
    phone: "Phone"
  }[part.trim()] || part.trim())).join(", ");
}

export function initials(text) {
  const clean = String(text || "").replace(/@.*/, "").replace(/[^A-Za-z0-9 ._-]/g, " ").trim();
  if (!clean) return "SF";
  const parts = clean.split(/[ ._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
}

// ---------- Plans ----------
export const PLAN_ORDER = ["Go", "Pro monthly", "Pro 3-month", "Legacy annual"];

export function planLabel(productID) {
  if (productID?.includes("go.monthly")) return "Go";
  if (productID?.includes("threemonth")) return "Pro 3-month";
  if (productID?.includes("annual")) return "Legacy annual";
  if (productID?.includes("pro.monthly")) return "Pro monthly";
  return productID || "Unknown plan";
}

// ---------- Providers ----------
export const PROVIDER_IDS = ["byteplus", "google", "openai", "other"];
export const PROVIDER_NAMES = { byteplus: "BytePlus", google: "Google", openai: "OpenAI", other: "Other" };
export const PROVIDER_FULL_NAMES = { byteplus: "BytePlus ModelArk", google: "Google Gemini API", openai: "OpenAI", other: "Other" };
export const PROVIDER_COLORS = { byteplus: "#7ae8bb", google: "#80aafe", openai: "#b497fc", other: "#5e656e" };

/** Same mapping the backend uses (financeProviders.billingProviderForEvent). */
export function providerId(label) {
  const value = String(label || "").trim().toLowerCase();
  if (value.includes("bytedance") || value.includes("byteplus")) return "byteplus";
  if (value.includes("google")) return "google";
  if (value.includes("openai")) return "openai";
  return "other";
}

export function providerName(id) {
  return PROVIDER_NAMES[id] || id || "Unknown";
}

// ---------- Events ----------
const ACTION_LABELS = {
  director: "AI Director",
  promptAssistant: "Prompt assistant",
  openAICaptions: "Captions",
  imagePrompt: "Editor image",
  creationImage: "Studio image",
  model3D: "3D model",
  model3d: "3D model",
  creationVideo: "Studio video",
  musicVideoScene: "Music video scene",
  musicVideoPreview: "Music video preview",
  musicVideoFinal: "Music video final",
  video: "Editor video",
  videoUndelivered: "Undelivered video",
  voiceover: "Voiceover",
  liveVoiceoverAssistSession: "Live voiceover assist",
  musicGenerate: "Soundtrack",
  continuation: "Video continuation",
  generation: "Generation"
};

export function actionLabel(action) {
  return ACTION_LABELS[action] || action || "AI request";
}

export function kindLabel(kind) {
  return { text: "Text", image: "Image", video: "Video", caption: "Captions", music: "Music", transcription: "Transcription", voice: "Voice", "3d": "3D" }[kind] || kind || "Usage";
}
