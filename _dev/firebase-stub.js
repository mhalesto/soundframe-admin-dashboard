// Local stand-in for the Firebase SDK: a fake signed-in admin and canned callable responses. No network.
// Scenarios via ?scenario=: signedout | locked | empty | error | nofinance | financedenied | slow | critical | healthy
const params = new URLSearchParams(location.search);
const scenario = params.get("scenario") || (location.search.includes("nofinance") ? "nofinance" : "default");
const delay = scenario === "slow" ? 2200 : 260;
const [dashboardBase, financeBase] = await Promise.all([
  fetch("/__harness/dashboard-mock.json").then((response) => response.json()),
  fetch("/__harness/finance-mock.json").then((response) => response.json())
]);
window.__callableLog = [];
window.__scenario = scenario;

function dashboardData() {
  const data = structuredClone(dashboardBase);
  data.generatedAt = new Date().toISOString();
  if (scenario === "empty") {
    data.users = [];
    data.recentEvents = [];
    data.costByModel = [];
    data.auditLog = [];
    data.usageByDay = data.usageByDay.map((row) => ({ ...row, requests: 0, videos: 0, credits: 0, providerCostUSD: 0 }));
    data.undeliveredVideo = { windowDays: 14, jobs: 0, estimatedCostUSD: 0, byReason: [], recent: [] };
    Object.keys(data.stats).forEach((key) => { data.stats[key] = 0; });
  }
  return data;
}

function financeData() {
  const data = structuredClone(financeBase);
  if (scenario === "critical") {
    const card = data.providers.find((entry) => entry.id === "byteplus");
    card.status = "critical";
    card.balance.availableUSD = 3.8;
    card.balance.cashUSD = 3.8;
    card.runway.days = 0.6;
    data.overview.verifiedBalanceUSD = 3.8;
    data.overview.shortestRunwayDays = 0.6;
    data.alerts.unshift({ severity: "critical", kind: "low_balance", provider: "byteplus", message: "BytePlus ModelArk balance $3.80 is below the critical threshold ($5.00)." });
  }
  if (scenario === "healthy") {
    data.alerts = data.alerts.filter((alert) => alert.severity === "info");
    data.providers.forEach((card) => { if (card.status !== "unavailable") card.status = "ok"; });
    data.overview.providersRequiringAttention = 0;
  }
  return data;
}

export function initializeApp() { return {}; }
export function getAuth() { return {}; }
export function onAuthStateChanged(_auth, callback) {
  setTimeout(() => callback(scenario === "signedout" ? null : {
    uid: "kQ2mZr8YtV4pL1xN6sD0aHf3Wc7u", isAnonymous: false, email: "admin@example.com", displayName: "SoundFrame Admin",
    providerData: [{ providerId: "google.com" }], getIdToken: async () => "local-token"
  }), 0);
}
export async function signInAnonymously() {}
export async function signInWithPopup() {}
export class GoogleAuthProvider {}
export async function signOut() { location.search = "?scenario=signedout"; }
export function getFunctions() { return {}; }
export function httpsCallable(_functions, name) {
  return async (payload) => {
    window.__callableLog.push({ name, at: Date.now() });
    document.documentElement.dataset.callables = window.__callableLog.map((entry) => entry.name.replace("soundframeAdmin", "")).join(",");
    await new Promise((resolve) => setTimeout(resolve, name === "soundframeAdminFinanceSync" ? delay * 4 : delay));
    const fail = (code, message) => { throw Object.assign(new Error(message), { code: `functions/${code}` }); };
    if (scenario === "error" && name !== "soundframeAdminStatus") fail("unavailable", "Could not reach Cloud Functions (network error).");
    if (name.startsWith("soundframeAdminFinance") && (scenario === "nofinance" || scenario === "empty")) fail("not-found", "Function soundframeAdminFinanceMonitor not found.");
    if (name.startsWith("soundframeAdminFinance") && scenario === "financedenied") fail("permission-denied", "Billing access is not permitted for this admin.");
    if (name === "soundframeAdminStatus") return { data: { uid: "kQ2mZr8YtV4pL1xN6sD0aHf3Wc7u", isAdmin: scenario !== "locked" } };
    if (name === "soundframeAdminDashboard") return { data: dashboardData() };
    if (name === "soundframeAdminUpdateUserLimits") return { data: dashboardData() };
    if (name === "soundframeAdminFinanceMonitor" || name === "soundframeAdminFinanceSync") return { data: financeData() };
    if (name === "soundframeAdminFinanceUpdateSettings") {
      const next = financeData();
      next.settings = { ...next.settings, ...payload.settings, updatedAt: new Date().toISOString(), updatedBy: "admin@example.com" };
      return { data: next };
    }
    throw new Error(`No stub for ${name}`);
  };
}
