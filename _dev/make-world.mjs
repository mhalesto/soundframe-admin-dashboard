// Builds one consistent fake "world" (users, generation events, job outcomes) and derives BOTH admin
// callable responses from it: soundframeAdminDashboard (mirrors admin.ts aggregation) and
// soundframeAdminFinanceMonitor (the real computeFinanceMonitor). No Firestore, no network.
// Usage (Node 22, after `npm --prefix functions run build` in soundframe-ios):
//   SOUNDFRAME_FUNCTIONS_LIB=~/Documents/GitHub/soundframe-ios/functions/lib node _dev/make-world.mjs
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const LIB = (process.env.SOUNDFRAME_FUNCTIONS_LIB || "").replace(/^~/, process.env.HOME || "");
if (!LIB) {
  console.error("Set SOUNDFRAME_FUNCTIONS_LIB to soundframe-ios/functions/lib (built).");
  process.exit(1);
}
const { computeFinanceMonitor, financeSettingsFromData } = await import(`${LIB}/financeMonitor.js`);
const { billingProviderForEvent } = await import(`${LIB}/financeProviders.js`);

const outDir = process.argv[2] || fileURLToPath(new URL(".", import.meta.url));
const DAY = 86400000;
const now = new Date(Math.floor(Date.now() / 60000) * 60000);
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const period = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
const dayKey = (date) => date.toISOString().slice(0, 10);
let seed = 11;
const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
const pick = (list) => list[Math.floor(rand() * list.length)];
const hex = (text) => createHash("sha256").update(text).digest("hex");
const uidFor = (text) => Buffer.from(hex(`uid-${text}`), "hex").toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 28);

const PLAN = {
  go: "com.currenttech.soundframe.go.monthly",
  pro: "com.currenttech.soundframe.pro.monthly",
  three: "com.currenttech.soundframe.pro.threemonth",
  annual: "com.currenttech.soundframe.pro.annual"
};
const LIMITS = { [PLAN.go]: [750, 1], [PLAN.pro]: [2500, 4], [PLAN.three]: [3000, 6], [PLAN.annual]: [3000, 6] };

// Fake people only (example.com). intensity scales how much they generate.
const people = [
  ["maya.k@example.com", "Maya K.", "apple.com", PLAN.pro, 1.6],
  ["jordan.beats@example.com", "Jordan Beats", "google.com", PLAN.three, 2.4],
  ["", "", "anonymous", PLAN.go, 0.5],
  ["lena.vfx@example.com", "Lena V.", "apple.com", PLAN.pro, 1.1],
  ["studio.nine@example.com", "Studio Nine", "google.com", PLAN.three, 1.8],
  ["kofi.m@example.com", "Kofi M.", "apple.com", PLAN.go, 0.9],
  ["ari.sound@example.com", "", "apple.com", PLAN.pro, 0.7],
  ["", "", "anonymous", PLAN.pro, 0.4],
  ["thandi.z@example.com", "Thandi Z.", "google.com", PLAN.go, 0.6],
  ["noah.edits@example.com", "Noah", "apple.com", PLAN.pro, 1.3],
  ["priya.r@example.com", "Priya R.", "apple.com", PLAN.three, 0.8],
  ["", "Night Drive", "apple.com", PLAN.go, 0.3],
  ["sam.loops@example.com", "Sam Loops", "google.com", PLAN.pro, 0.5],
  ["owner.debug@example.com", "Owner (debug)", "google.com", PLAN.pro, 0.6, "Debug"],
  ["eli.frames@example.com", "Eli", "apple.com", PLAN.annual, 0.4],
  ["", "", "anonymous", PLAN.go, 0.2]
].map(([email, displayName, authProvider, productID, intensity, runtime], index) => ({
  key: `p${index}`, email, displayName, authProvider, productID, intensity, runtime: runtime || "Release 3.4 (241)",
  uid: uidFor(`p${index}`), subject: hex(`subject-p${index}`)
}));

const templates = [
  { action: "director", kind: "text", provider: "Google", model: "gemini-3.1-flash-lite", credits: 8, cost: 0.0042, weight: 10 },
  { action: "promptAssistant", kind: "text", provider: "Google", model: "gemini-3.1-flash-lite", credits: 3, cost: 0.0016, weight: 6 },
  { action: "openAICaptions", kind: "caption", provider: "OpenAI", model: "gpt-transcribe", credits: 6, cost: 0.018, weight: 7 },
  { action: "imagePrompt", kind: "image", provider: "Google", model: "gemini-3.1-flash-image", credits: 40, cost: 0.067, weight: 8 },
  { action: "creationImage", kind: "image", provider: "OpenAI", model: "gpt-image-2", credits: 60, cost: 0.053, weight: 3 },
  { action: "creationImage", kind: "image", provider: "BytePlus", model: "dola-seedream-5-0-pro-260628", credits: 45, cost: 0.045, weight: 2 },
  { action: "model3D", kind: "image", provider: "BytePlus", model: "hyper3d-gen2-260112", credits: 120, cost: 0.399, weight: 1.2 },
  { action: "creationVideo", kind: "video", provider: "ByteDance", model: "dreamina-seedance-2-5-260628", credits: 0, cost: () => 1.4 + rand() * 1.2, weight: 2.4 },
  { action: "musicVideoPreview", kind: "video", provider: "ByteDance", model: "dreamina-seedance-2-5-260628", credits: 0, cost: 0.525, weight: 1.6 },
  { action: "video", kind: "video", provider: "Google", model: "veo-3.1-fast-generate-preview", credits: 0, cost: 1.2, weight: 0.8 },
  { action: "voiceover", kind: "text", provider: "OpenAI", model: "gpt-4o-mini-tts", credits: 12, cost: null, weight: 0.4 }
];
const totalWeight = templates.reduce((sum, item) => sum + item.weight, 0);
const pickTemplate = () => {
  let roll = rand() * totalWeight;
  for (const item of templates) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return templates[0];
};

const events = [];
for (let offset = 120; offset >= 0; offset -= 1) {
  const dayStart = today.getTime() - offset * DAY;
  const ramp = offset < 30 ? 1.35 : offset < 60 ? 1.05 : 0.8;
  people.forEach((person) => {
    const count = Math.round(person.intensity * ramp * (0.4 + rand() * 1.6));
    for (let index = 0; index < count; index += 1) {
      const at = new Date(dayStart + Math.floor(rand() * DAY));
      if (at > now) continue;
      const template = pickTemplate();
      const cost = typeof template.cost === "function" ? +template.cost().toFixed(4) : template.cost;
      events.push({ ...template, cost, at, person, undelivered: false });
    }
  });
}
// A spike today and two undelivered Veo jobs.
events.push({ ...templates[7], cost: 14.5, at: new Date(now.getTime() - 2 * 3600e3), person: people[1], undelivered: false });
[["user-cancelled", 3], ["stale-poll", 6]].forEach(([reason, days]) => {
  events.push({ action: "videoUndelivered", kind: "video", provider: "Google", model: "veo-3.1-fast-generate-preview", credits: 0, cost: 1.2,
    at: new Date(now.getTime() - days * DAY), person: people[6], undelivered: true, reason, seconds: 8 });
});
events.sort((lhs, rhs) => rhs.at - lhs.at);

// --- soundframeAdminDashboard ---
const periodKey = period(now);
const windowStart = today.getTime() - 13 * DAY;
const windowEvents = events.filter((event) => event.at.getTime() >= windowStart);
const delivered = windowEvents.filter((event) => !event.undelivered);
const usageDocs = people.map((person) => {
  const mine = events.filter((event) => event.person === person && period(event.at) === periodKey && !event.undelivered);
  const credits = mine.reduce((sum, event) => sum + event.credits, 0);
  const videos = mine.filter((event) => event.kind === "video").length;
  const last = mine[0];
  return { person, credits, videos, mine, last };
}).filter((doc) => doc.mine.length > 0);

const overrides = {
  [people[1].subject]: { quotaSubjectHash: people[1].subject, creditLimitOverride: 6000, videoLimitOverride: 12, note: "Launch campaign creator — approved Oct 2", disabled: false },
  [people[5].subject]: { quotaSubjectHash: people[5].subject, creditLimitOverride: 1200, videoLimitOverride: null, note: "Support credit after failed export", disabled: false },
  [people[9].subject]: { quotaSubjectHash: people[9].subject, creditLimitOverride: null, videoLimitOverride: 8, note: "Trial extension (paused)", disabled: true }
};

const users = usageDocs.map(({ person, credits, videos, mine, last }) => {
  const [creditLimit, videoLimit] = LIMITS[person.productID];
  const override = overrides[person.subject] || null;
  const active = override && !override.disabled ? override : null;
  // Push a couple of accounts close to or over their limits so the risk states show.
  const creditsUsed = person.key === "p2" ? 742 : person.key === "p8" ? 790 : Math.min(credits, Math.round(creditLimit * 0.82));
  const videoUsed = person.key === "p0" ? 4 : person.key === "p8" ? 1 : Math.min(videos, videoLimit);
  return {
    id: `${person.subject.slice(0, 20)}_${periodKey}`,
    uid: person.uid,
    email: person.email,
    displayName: person.displayName,
    authProvider: person.authProvider,
    quotaSubjectHash: person.subject,
    subscriptionProductID: person.productID,
    period: periodKey,
    creditsUsed,
    creditLimit,
    effectiveCreditLimit: active?.creditLimitOverride ?? creditLimit,
    videoUsed,
    videoLimit,
    effectiveVideoLimit: active?.videoLimitOverride ?? videoLimit,
    textUsed: mine.filter((event) => event.kind === "text").length,
    imageUsed: mine.filter((event) => event.kind === "image").length,
    captionUsed: mine.filter((event) => event.kind === "caption").length,
    providerCostUSD: +mine.reduce((sum, event) => sum + (event.cost || 0), 0).toFixed(6),
    lastProvider: last?.provider || "",
    lastModel: last?.model || "",
    updatedAt: (last?.at || now).toISOString(),
    override
  };
}).sort((lhs, rhs) => Date.parse(rhs.updatedAt) - Date.parse(lhs.updatedAt));

const usageByDay = [];
for (let offset = 13; offset >= 0; offset -= 1) {
  const day = new Date(today.getTime() - offset * DAY);
  const rows = delivered.filter((event) => dayKey(event.at) === dayKey(day));
  usageByDay.push({
    day: dayKey(day),
    requests: rows.length,
    videos: rows.filter((event) => event.kind === "video").length,
    credits: rows.reduce((sum, event) => sum + event.credits, 0),
    providerCostUSD: +rows.reduce((sum, event) => sum + (event.cost || 0), 0).toFixed(6)
  });
}
const costMap = new Map();
delivered.forEach((event) => {
  const key = `${event.provider} ${event.model}`;
  const row = costMap.get(key) || { provider: event.provider, model: event.model, requests: 0, credits: 0, providerCostUSD: 0 };
  row.requests += 1;
  row.credits += event.credits;
  row.providerCostUSD += event.cost || 0;
  costMap.set(key, row);
});
const costByModel = Array.from(costMap.values()).map((row) => ({ ...row, providerCostUSD: +row.providerCostUSD.toFixed(6) }))
  .sort((lhs, rhs) => rhs.providerCostUSD - lhs.providerCostUSD || rhs.requests - lhs.requests).slice(0, 24);
const undeliveredEvents = windowEvents.filter((event) => event.undelivered);
const byReason = new Map();
undeliveredEvents.forEach((event) => {
  const row = byReason.get(event.reason) || { reason: event.reason, jobs: 0, estimatedCostUSD: 0 };
  row.jobs += 1;
  row.estimatedCostUSD += event.cost;
  byReason.set(event.reason, row);
});
const stats = {
  usageRecords: users.length,
  activeUsers: new Set(users.map((user) => user.uid)).size,
  creditsUsed: users.reduce((sum, user) => sum + user.creditsUsed, 0),
  videoClipsUsed: users.reduce((sum, user) => sum + user.videoUsed, 0),
  providerCostUSD: +users.reduce((sum, user) => sum + user.providerCostUSD, 0).toFixed(6),
  activeOverrides: Object.values(overrides).filter((override) => !override.disabled).length,
  windowRequests: usageByDay.reduce((sum, row) => sum + row.requests, 0),
  windowVideos: usageByDay.reduce((sum, row) => sum + row.videos, 0),
  windowProviderCostUSD: +usageByDay.reduce((sum, row) => sum + row.providerCostUSD, 0).toFixed(6),
  windowUndeliveredVideos: undeliveredEvents.length,
  windowUndeliveredCostUSD: +undeliveredEvents.reduce((sum, event) => sum + event.cost, 0).toFixed(6)
};
const adminUID = "kQ2mZr8YtV4pL1xN6sD0aHf3Wc7u";
const auditLog = [
  ["updateFinanceSettings", "", "Finance settings: manual balances (OpenAI)", "", 0.2],
  ["updateUserLimits", people[1].subject, "video limit → 12, credit limit → 6000", "Launch campaign creator — approved Oct 2", 1.4],
  ["syncFinance", "", "Billing sync: BytePlus verified; OpenAI permission denied; Google not configured", "", 2.1],
  ["updateUserLimits", people[5].subject, "credit limit → 1200", "Support credit after failed export", 4.8],
  ["updateUserLimits", people[9].subject, "video limit → 8, paused override", "Trial extension (paused)", 6.5],
  ["updateFinanceSettings", "", "Finance settings: runway warning 14 days, spike × 2.5", "", 9.2],
  ["updateUserLimits", people[12].subject, "cleared credit override", "", 12.7]
].map(([action, subject, changes, note, daysAgo], index) => ({
  id: `audit-${index}`, action, quotaSubjectHash: subject, changes, note, byUID: adminUID,
  byEmail: "admin@example.com", at: new Date(now.getTime() - daysAgo * DAY).toISOString()
}));

const dashboard = {
  uid: adminUID,
  periodKey,
  generatedAt: now.toISOString(),
  eventWindowDays: 14,
  stats,
  users,
  usageByDay,
  costByModel,
  recentEvents: windowEvents.slice(0, 80).map((event, index) => ({
    id: `evt-${index}`, uid: event.person.uid, action: event.action, usageKind: event.kind, provider: event.provider, model: event.model,
    credits: event.credits, providerCostUSD: event.cost || 0, createdAt: event.at.toISOString()
  })),
  undeliveredVideo: {
    windowDays: 14,
    jobs: undeliveredEvents.length,
    estimatedCostUSD: stats.windowUndeliveredCostUSD,
    byReason: Array.from(byReason.values()),
    recent: undeliveredEvents.map((event, index) => ({ id: `und-${index}`, uid: event.person.uid, model: event.model, reason: event.reason,
      videoSeconds: event.seconds, estimatedCostUSD: event.cost, createdAt: event.at.toISOString() }))
  },
  auditLog
};

// --- soundframeAdminFinanceMonitor (real computation) ---
const financeEvents = events.map((event) => ({
  provider: billingProviderForEvent(event.provider), providerLabel: event.provider, model: event.model, costUSD: event.cost,
  kind: event.kind, action: event.action, at: event.at, undelivered: event.undelivered, runtime: event.person.runtime,
  subject: event.person.subject, uid: event.person.uid
}));
const usage = [];
for (let offset = 0; offset < 6; offset += 1) {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
  const key = period(month);
  people.forEach((person) => {
    const mine = events.filter((event) => event.person === person && period(event.at) === key);
    if (mine.length === 0) return;
    usage.push({ period: key, subject: person.subject, uid: person.uid, productID: person.productID,
      costUSD: mine.reduce((sum, event) => sum + (event.cost || 0), 0) });
  });
}
const outcomes = [];
const outcomeMix = [
  ["byteplus", "dreamina-seedance-2-5-260628", ["succeeded", 41], ["failed", 4], ["cancelled", 2], ["pending", 2]],
  ["byteplus", "hyper3d-gen2-260112", ["succeeded", 9], ["failed", 2], ["cancelled", 1]],
  ["byteplus", "dola-seedream-5-0-pro-260628", ["succeeded", 14], ["failed", 0]],
  ["google", "gemini-3.1-flash-image", ["succeeded", 33], ["failed", 1]],
  ["google", "veo-3.1-fast-generate-preview", ["succeeded", 11], ["failed", 3], ["cancelled", 2], ["pending", 1]],
  ["openai", "gpt-image-2", ["succeeded", 17], ["failed", 1]]
];
outcomeMix.forEach(([provider, model, ...mix]) => {
  mix.forEach(([outcome, count]) => {
    for (let index = 0; index < count; index += 1) {
      outcomes.push({ provider, model, outcome, at: new Date(now.getTime() - (outcome === "pending" ? 0.02 : rand() * 25) * DAY) });
    }
  });
});
const settings = financeSettingsFromData({
  manualBalances: { openai: { amountUSD: 60, asOf: new Date(now.getTime() - 14 * DAY).toISOString(), note: "console" } },
  updatedAt: new Date(now.getTime() - 0.2 * DAY).toISOString(), updatedBy: "admin@example.com"
});
const syncAt = new Date(now.getTime() - 50 * 60e3).toISOString();
const finance = computeFinanceMonitor({
  now, settings, events: financeEvents, eventsTruncated: false, usage, usageTruncated: false, outcomes,
  providers: {
    byteplus: { provider: "byteplus", lastAttemptAt: syncAt, lastSuccessAt: syncAt, lastVerifiedBalance: null, lastVerifiedSpend: null,
      result: { provider: "byteplus", checkedAt: syncAt, balanceStatus: "verified",
        balance: { availableUSD: 42.6, cashUSD: 42.6, creditUSD: 0, arrearsUSD: 0, frozenUSD: 0, currency: "USD", currencyReported: false },
        spendStatus: "verified", spend: { currency: "USD", monthToDate: 96.4, previousMonth: 160.2, daily: [],
          breakdown: [{ label: "ModelArk", amount: 96.1, ai: true }, { label: "TOS", amount: 0.3, ai: false }], source: "BytePlus ListBillOverviewByProd" },
        messages: ["QueryBalanceAcct returned no currency; shown as USD, the BytePlus international billing currency."] } },
    openai: { provider: "openai", lastAttemptAt: syncAt, lastSuccessAt: "", lastVerifiedBalance: null, lastVerifiedSpend: null,
      result: { provider: "openai", checkedAt: syncAt, balanceStatus: "unavailable", balance: null, spendStatus: "permission_denied", spend: null,
        messages: ["OpenAI has no supported credit-balance API; record a manual balance for an estimated runway.",
          "Costs API rejected the key (HTTP 401). It needs an organization Admin API key, not a project key."] } },
    google: { provider: "google", lastAttemptAt: syncAt, lastSuccessAt: "", lastVerifiedBalance: null, lastVerifiedSpend: null,
      result: { provider: "google", checkedAt: syncAt, balanceStatus: "unavailable", balance: null, spendStatus: "not_configured", spend: null,
        messages: ["Gemini API prepay balances can only be viewed in Google AI Studio → Billing; record a manual balance for an estimated runway.",
          "Enable the Cloud Billing export to BigQuery and set its table in Finance settings to read verified Google spend."] } }
  },
  history: [88, 79.5, 71.2, 64.9, 58.3, 51.7, 47.1, 42.6].map((value, index) => ({ provider: "byteplus", availableUSD: value,
    at: new Date(now.getTime() - (7 - index) * 12 * 3600e3) }))
});

writeFileSync(join(outDir, "dashboard-mock.json"), JSON.stringify(dashboard));
writeFileSync(join(outDir, "finance-mock.json"), JSON.stringify(finance));
console.log("users", users.length, "events(14d)", windowEvents.length, "stats", JSON.stringify(stats));
console.log("alerts", finance.alerts.map((alert) => `${alert.severity}:${alert.kind}`).join(", "));
console.log("overview", JSON.stringify(finance.overview));
