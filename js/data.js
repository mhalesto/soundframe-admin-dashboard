// Derived, read-only views of the admin responses (soundframeAdminDashboard, soundframeAdminFinanceMonitor and
// soundframeAdminAppStoreSubscribers).
// Nothing here fabricates data: when a source is missing, selectors return null so the UI can say so.
import { state, prefs, isRead } from "./store.js";
import {
  PROVIDER_IDS, PROVIDER_FULL_NAMES, providerId, planLabel, money, number, dayKey, formatDay, plural, actionLabel
} from "./format.js";

const DAY_MS = 86400000;

// ---------- Date ranges (UTC days) ----------
export const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
  { id: "mtd", label: "Current month" },
  { id: "prev-month", label: "Previous month" }
];

function utcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function anchorDay() {
  const stamp = state.finance?.generatedAt || state.dashboard?.generatedAt;
  const date = stamp ? new Date(stamp) : new Date();
  return utcDay(Number.isNaN(date.getTime()) ? new Date() : date);
}

export function resolveRange(preset = prefs.range, from = prefs.customFrom, to = prefs.customTo) {
  const today = anchorDay();
  const make = (id, label, start, end) => {
    const days = Math.round((end - start) / DAY_MS) + 1;
    return { id, label, start, end, days, short: `${formatDay(start)} – ${formatDay(end)}` };
  };
  if (preset === "mtd") {
    return make("mtd", "Current month", new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today);
  }
  if (preset === "prev-month") {
    const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return make("prev-month", start.toLocaleDateString("en", { month: "long", timeZone: "UTC" }), start, end);
  }
  if (preset === "custom" && from && to) {
    let start = utcDay(new Date(`${from}T00:00:00Z`));
    let end = utcDay(new Date(`${to}T00:00:00Z`));
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      if (start > end) [start, end] = [end, start];
      if (end > today) end = today;
      const range = make("custom", "", start, end);
      range.label = range.short;
      return range;
    }
  }
  const option = RANGE_PRESETS.find((entry) => entry.id === preset && entry.days) || RANGE_PRESETS[1];
  return make(option.id, option.label, new Date(today.getTime() - (option.days - 1) * DAY_MS), today);
}

export function previousRange(range) {
  if (range.id === "prev-month" || range.id === "mtd") {
    // Calendar months compare with the month before (same day span for month-to-date).
    const start = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth() - 1, 1));
    const monthEnd = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 0));
    const end = range.id === "mtd" ? new Date(Math.min(monthEnd.getTime(), start.getTime() + (range.days - 1) * DAY_MS)) : monthEnd;
    return { start, end, days: Math.round((end - start) / DAY_MS) + 1, short: `${formatDay(start)} – ${formatDay(end)}` };
  }
  const end = new Date(range.start.getTime() - DAY_MS);
  const start = new Date(end.getTime() - (range.days - 1) * DAY_MS);
  return { start, end, days: range.days, short: `${formatDay(start)} – ${formatDay(end)}` };
}

/** True while a source has not answered for the first time yet (show a placeholder, not "Unavailable"). */
export function isPending() {
  const dashboardPending = !state.dashboard && !state.dashboardError && state.auth !== "error";
  const financePending = !state.finance && !state.financeError;
  return dashboardPending || financePending;
}

// ---------- Spend series (finance monitor, 90 daily points) ----------
export function dailySeries() {
  const points = state.finance?.series?.daily || [];
  return points.map((point) => ({ ...point, date: utcDay(new Date(point.start)), key: dayKey(new Date(point.start)) }));
}

export function pointsIn(points, range) {
  return points.filter((point) => point.date >= range.start && point.date <= range.end);
}

export function summarize(points) {
  const byProvider = Object.fromEntries(PROVIDER_IDS.map((id) => [id, 0]));
  let spend = 0;
  let generations = 0;
  let peak = null;
  points.forEach((point) => {
    const total = Number(point.totalUSD) || 0;
    spend += total;
    generations += Number(point.generations) || 0;
    PROVIDER_IDS.forEach((id) => { byProvider[id] += Number(point.byProvider?.[id]) || 0; });
    if (!peak || total > peak.totalUSD) peak = point;
  });
  return { spend, generations, byProvider, peak, days: points.length, average: points.length ? spend / points.length : 0 };
}

/** Spend and generations for the active range plus the comparison period, from the 90-day series. */
export function rangeSummary(range = resolveRange()) {
  if (!state.finance) return null;
  const all = dailySeries();
  const current = pointsIn(all, range);
  const previous = previousRange(range);
  const previousPoints = pointsIn(all, previous);
  const earliest = all[0]?.date;
  return {
    range,
    points: current,
    summary: summarize(current),
    previous,
    previousPoints,
    previousSummary: previousPoints.length === previous.days ? summarize(previousPoints) : null,
    partial: Boolean(earliest && range.start < earliest),
    earliest
  };
}

export function deltaInfo(current, previous) {
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? { dir: "flat", pct: 0 } : { dir: "up", pct: null };
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { dir: Math.abs(pct) < 0.5 ? "flat" : pct > 0 ? "up" : "down", pct };
}

// ---------- Users and limits ----------
export function usageRatio(used, limit) {
  const usedValue = Number(used) || 0;
  const limitValue = Number(limit) || 0;
  if (limitValue <= 0) return usedValue > 0 ? Number.POSITIVE_INFINITY : 0;
  return usedValue / limitValue;
}

export function riskLevel(user) {
  const worst = Math.max(usageRatio(user.videoUsed, user.effectiveVideoLimit), usageRatio(user.creditsUsed, user.effectiveCreditLimit));
  if (worst >= 1) return "over";
  if (worst >= 0.9) return "near";
  return "ok";
}

export function userStatusTags(user) {
  const tags = [];
  const risk = riskLevel(user);
  if (risk === "over") tags.push("over");
  if (risk === "near") tags.push("near");
  if (user.override && !user.override.disabled) tags.push("override");
  if (user.override?.disabled) tags.push("paused");
  return tags;
}

export function users() {
  return state.dashboard?.users || [];
}

export function findUser(hash) {
  return users().find((user) => user.quotaSubjectHash === hash) || null;
}

export function usersAtRisk() {
  return users()
    .map((user) => ({ user, risk: riskLevel(user), ratio: Math.max(usageRatio(user.videoUsed, user.effectiveVideoLimit), usageRatio(user.creditsUsed, user.effectiveCreditLimit)) }))
    .filter((entry) => entry.risk !== "ok")
    .sort((lhs, rhs) => rhs.ratio - lhs.ratio);
}

// ---------- Subscribers ----------
async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The backend hashes "transaction:<originalTransactionID>" into quotaSubjectHash (entitlements.ts). */
// ---------- App Store subscriptions (App Store Server Notifications V2) ----------
/**
 * Where the App Store source stands: "live" once Apple has delivered a notification, "waiting" when the callable
 * answers but nothing has arrived, "not-deployed" / "error" when the callable fails, "pending" before it answers.
 */
export function appStoreSourceState() {
  if (state.appStore) return state.appStore.endpoint?.configured ? "live" : "waiting";
  if (state.appStoreError) return state.appStoreError.kind === "missing" ? "not-deployed" : "error";
  return "pending";
}

export function appStoreCounts(environment = "Production") {
  return state.appStore?.counts?.[environment] || null;
}

export function appStoreRows() {
  return state.appStore?.rows || [];
}

export function findAppStoreSubscription(hash) {
  return appStoreRows().find((row) => row.subscriptionHash === hash) || null;
}

function appStoreNotifications() {
  const source = appStoreSourceState();
  if (source === "pending") return [];
  if (source !== "live") {
    const waiting = source === "waiting";
    return [{
      id: waiting ? "subs:notifications-waiting" : "subs:coverage-gap",
      severity: "info",
      category: "subscribers",
      kind: "coverage",
      title: waiting ? "No App Store notifications received yet" : "Some App Store subscribers are invisible here",
      detail: waiting
        ? "The notification endpoint is deployed, but Apple has not sent anything yet. Register its URL in App Store Connect, then confirm with a TestFlight (sandbox) purchase."
        : "The backend only sees subscribers who used AI this month. A paid subscription with no AI activity will not appear until App Store notifications are connected.",
      route: "#subscribers"
    }];
  }
  const report = state.appStore;
  const production = report.counts.Production;
  const missed = APP_STORE_ENVIRONMENTS.reduce((sum, environment) => sum + (report.counts[environment]?.unconfirmed || 0), 0);
  const list = [];
  if (production.billingRetry + production.grace > 0) {
    list.push({
      id: stableID("subs", "billing", production.billingRetry, production.grace),
      severity: "warning",
      category: "subscribers",
      kind: "billing",
      title: `${plural(production.billingRetry + production.grace, "subscription")} with a failed renewal`,
      detail: `${number(production.grace)} in the grace period (still have access) and ${number(production.billingRetry)} in billing retry (no access). Apple keeps retrying the payment.`,
      route: "#subscribers?apple=attention"
    });
  }
  if (missed > 0) {
    list.push({
      id: stableID("subs", "missed-notice", missed),
      severity: "warning",
      category: "subscribers",
      kind: "sync",
      title: `${plural(missed, "subscription")} missed a renewal notice`,
      detail: "Their expiry passed without a renewal or expiry notification from Apple, so their state is unconfirmed. Check the endpoint's logs and the notification history in App Store Connect.",
      route: "#subscribers?apple=attention"
    });
  }
  const rejectedAt = Date.parse(report.endpoint.lastRejectedAt || "");
  if (Number.isFinite(rejectedAt) && Date.now() - rejectedAt < 7 * DAY_MS) {
    list.push({
      id: stableID("subs", "rejected", report.endpoint.rejectedCount),
      severity: "warning",
      category: "subscribers",
      kind: "sync",
      title: "App Store notifications were rejected",
      detail: `${plural(report.endpoint.rejectedCount, "request")} rejected since tracking began (last reason: ${report.endpoint.lastRejectedReason || "unknown"}). Rejected requests failed Apple's signature or bundle checks and were not stored.`,
      route: "#subscribers",
      at: report.endpoint.lastRejectedAt
    });
  }
  return list;
}

export const APP_STORE_ENVIRONMENTS = ["Production", "Sandbox", "Unknown"];

export function hashAppStoreTransaction(originalTransactionID) {
  return sha256Hex(`transaction:${String(originalTransactionID).trim()}`);
}

/**
 * Internal test entitlements hash "internal-test-user:<uid>" instead of an Apple transaction. Checking that hash
 * in the browser identifies them exactly; anything else came from a verified StoreKit transaction (production,
 * sandbox or a debug installation — the response does not say which).
 */
export async function classifySubjects(rows) {
  if (!crypto?.subtle) return;
  await Promise.all(rows.map(async (user) => {
    if (!user.uid || !user.quotaSubjectHash || state.subjectKinds.has(user.quotaSubjectHash)) return;
    const internal = await sha256Hex(`internal-test-user:${user.uid}`);
    state.subjectKinds.set(user.quotaSubjectHash, internal === user.quotaSubjectHash ? "internal-test" : "store");
  }));
}

export function subscriptionSource(user) {
  return state.subjectKinds.get(user.quotaSubjectHash) || "store";
}

export function planCounts(rows = users()) {
  const counts = new Map();
  rows.forEach((user) => {
    const label = planLabel(user.subscriptionProductID);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return counts;
}

// ---------- Models and job outcomes (finance monitor, 30 days) ----------
export function models() {
  return state.finance?.models || [];
}

export function outcomeTotals(rows = models()) {
  const totals = { succeeded: 0, failed: 0, cancelled: 0, pending: 0, tracked: 0 };
  rows.forEach((row) => {
    if (!row.outcomes) return;
    totals.tracked += 1;
    totals.succeeded += row.outcomes.succeeded;
    totals.failed += row.outcomes.failed;
    totals.cancelled += row.outcomes.cancelled;
    totals.pending += row.outcomes.pending;
  });
  const finished = totals.succeeded + totals.failed;
  totals.successRate = finished > 0 ? Math.round((totals.succeeded / finished) * 1000) / 10 : null;
  return totals;
}

export function failingModels(rows = models()) {
  return rows.filter((row) => row.outcomes && row.outcomes.successRate !== null && row.outcomes.failed >= 2 && row.outcomes.successRate < 90)
    .sort((lhs, rhs) => lhs.outcomes.successRate - rhs.outcomes.successRate);
}

export function modelKey(row) {
  return `${row.provider}:${row.model}`;
}

export function findModel(key) {
  return models().find((row) => modelKey(row) === key) || null;
}

// ---------- Providers ----------
export function providerCards() {
  return state.finance?.providers || [];
}

export function findProvider(id) {
  return providerCards().find((card) => card.id === id) || null;
}

export const BALANCE_KIND = {
  verified: { label: "Verified", cls: "prov-verified", hint: "Read from the provider billing API" },
  stale: { label: "Stale", cls: "prov-stale", hint: "Last verified reading; the latest sync did not return a balance" },
  manual_estimate: { label: "Estimated", cls: "prov-estimated", hint: "Manual balance minus spend tracked since it was recorded" },
  unavailable: { label: "Unavailable", cls: "prov-unavailable", hint: "No balance API or no balance recorded" }
};

export const CREDENTIAL = {
  verified: { label: "Verified", tone: "ok" },
  unavailable: { label: "No API", tone: "muted" },
  not_configured: { label: "Not configured", tone: "muted" },
  permission_denied: { label: "Permission required", tone: "warn" },
  error: { label: "Sync failed", tone: "crit" },
  never: { label: "Never synced", tone: "muted" }
};

export function credential(status) {
  return CREDENTIAL[status] || { label: status || "Unknown", tone: "muted" };
}

// ---------- Events ----------
export function events() {
  return state.dashboard?.recentEvents || [];
}

export function findEvent(id) {
  return events().find((event) => event.id === id) || null;
}

export function eventProvider(event) {
  return providerId(event.provider);
}

// ---------- Notifications ----------
const ALERT_TITLES = {
  low_balance: "Low balance",
  projected_exhaustion: "Runway running out",
  sync_error: "Billing sync failed",
  stale_sync: "Billing data is stale",
  spend_spike: "Unusual spend",
  tracking_gap: "Tracked vs billed gap",
  balance_unavailable: "No balance source",
  negative_margin: "Negative margin"
};

const PROVIDER_ALERT_KINDS = new Set(["low_balance", "projected_exhaustion", "sync_error", "stale_sync", "balance_unavailable", "tracking_gap"]);

function stableID(...parts) {
  return parts.filter(Boolean).join(":");
}

export function buildNotifications() {
  const list = [];
  const finance = state.finance;
  const dashboard = state.dashboard;
  if (finance) {
    (finance.alerts || []).forEach((alert) => {
      const route = PROVIDER_ALERT_KINDS.has(alert.kind) && alert.provider
        ? `#providers?provider=${alert.provider}`
        : alert.kind === "spend_spike" ? "#finance?tab=spend" : "#finance?tab=revenue";
      list.push({
        id: stableID("fin", alert.kind, alert.provider || "all", alert.severity),
        severity: alert.severity,
        category: PROVIDER_ALERT_KINDS.has(alert.kind) ? "providers" : "finance",
        kind: alert.kind,
        provider: alert.provider,
        title: `${ALERT_TITLES[alert.kind] || "Finance alert"}${alert.provider ? ` · ${PROVIDER_FULL_NAMES[alert.provider] || alert.provider}` : ""}`,
        detail: alert.message,
        route
      });
    });
    const failing = failingModels();
    failing.forEach((row) => {
      list.push({
        id: stableID("ops", "failures", row.provider, row.model, row.outcomes.successRate < 70 ? "critical" : "warning"),
        severity: row.outcomes.successRate < 70 ? "critical" : "warning",
        category: "operations",
        kind: "error_rate",
        title: `Error spike · ${row.label}`,
        detail: `${row.outcomes.successRate}% success over 30 days (${number(row.outcomes.failed)} failed of ${number(row.outcomes.succeeded + row.outcomes.failed)} finished jobs).`,
        route: `#operations?model=${encodeURIComponent(modelKey(row))}`
      });
    });
    const totals = outcomeTotals();
    if (totals.pending > 0) {
      list.push({
        id: stableID("ops", "inflight", totals.pending),
        severity: "info",
        category: "operations",
        kind: "in_flight",
        title: `${plural(totals.pending, "job")} in flight`,
        detail: "Queued or running generation jobs from the last 30 days. Queue wait time is not tracked, so delays cannot be measured here.",
        route: "#operations"
      });
    }
    const quality = finance.dataQuality || {};
    if (quality.unpricedGenerations30d > 0) {
      list.push({
        id: stableID("data", "unpriced", quality.unpricedGenerations30d),
        severity: "info",
        category: "operations",
        kind: "unpriced",
        title: "Generations without a recorded cost",
        detail: `${plural(quality.unpricedGenerations30d, "generation")} in the last 30 days had no provider cost recorded, so spend is understated.`,
        route: "#operations?unpriced=1"
      });
    }
    const generated = Date.parse(finance.generatedAt);
    if (Number.isFinite(generated) && Date.now() - generated > 2 * 3600e3) {
      list.push({
        id: stableID("data", "finance-stale", Math.floor(generated / 3600e3)),
        severity: "info",
        category: "finance",
        kind: "stale",
        title: "Provider figures are over 2 hours old",
        detail: "Refresh to recompute balances and spend.",
        route: "#providers"
      });
    }
  } else if (state.financeError) {
    const permission = state.financeError.kind === "permission";
    list.push({
      id: stableID("fin", "unavailable", state.financeError.kind),
      severity: "warning",
      category: "finance",
      kind: "monitor_unavailable",
      title: permission ? "Billing permission required" : "Provider monitoring unavailable",
      detail: permission
        ? "This admin account cannot read the finance monitor. Balances, spend and margins are hidden."
        : "Balances, spend history and margins could not be loaded. Overview figures that depend on them show as unavailable.",
      route: "#providers"
    });
  }
  if (dashboard) {
    const over = usersAtRisk().filter((entry) => entry.risk === "over");
    if (over.length > 0) {
      list.push({
        id: stableID("users", "over", over.length),
        severity: "warning",
        category: "users",
        kind: "over_limit",
        title: `${plural(over.length, "user")} over their monthly limit`,
        detail: over.slice(0, 3).map((entry) => entry.user.email || entry.user.displayName || "Anonymous user").join(", ") + (over.length > 3 ? ` and ${number(over.length - 3)} more` : ""),
        route: "#users?status=over"
      });
    }
    const leak = dashboard.undeliveredVideo;
    if (leak?.jobs > 0) {
      list.push({
        id: stableID("ops", "undelivered", leak.jobs),
        severity: "info",
        category: "operations",
        kind: "undelivered",
        title: `${plural(leak.jobs, "video job")} billed but not delivered`,
        detail: `${money(leak.estimatedCostUSD)} estimated provider spend in the last ${leak.windowDays} days never reached a creator.`,
        route: "#operations?tab=undelivered"
      });
    }
    const weekAgo = Date.now() - 7 * DAY_MS;
    (dashboard.auditLog || []).filter((entry) => Date.parse(entry.at) >= weekAgo).slice(0, 5).forEach((entry) => {
      list.push({
        id: stableID("audit", entry.id),
        severity: "info",
        category: "access",
        kind: "admin_change",
        title: entry.action === "updateUserLimits" ? "User limits changed" : "Admin change",
        detail: `${entry.changes || entry.action} · by ${entry.byEmail || "an admin"}`,
        route: `#audit?entry=${encodeURIComponent(entry.id)}`,
        at: entry.at
      });
    });
    list.push(...appStoreNotifications());
  }
  if (state.lastRefreshFailed && state.dashboardError) {
    list.push({
      id: stableID("sys", "refresh-failed"),
      severity: "warning",
      category: "system",
      kind: "refresh_failed",
      title: "Last refresh failed",
      detail: `${state.dashboardError.message} Showing the last loaded data.`,
      route: ""
    });
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  list.sort((lhs, rhs) => rank[lhs.severity] - rank[rhs.severity]);
  list.forEach((item) => { item.read = isRead(item.id); });
  return list;
}

export function overallHealth(notifications = buildNotifications()) {
  const critical = notifications.filter((item) => item.severity === "critical");
  const warnings = notifications.filter((item) => item.severity === "warning");
  if (!state.dashboard && !state.finance) return { tone: "muted", label: "Loading", detail: "" };
  if (critical.length > 0) {
    return { tone: "crit", label: "Critical", detail: `${plural(critical.length, "critical issue")}${warnings.length ? ` · ${plural(warnings.length, "warning")}` : ""}` };
  }
  if (!state.finance) return { tone: "warn", label: "Partial data", detail: "Provider monitoring unavailable" };
  if (warnings.length > 0) return { tone: "warn", label: "Needs attention", detail: plural(warnings.length, "warning") };
  return { tone: "ok", label: "Operational", detail: "No balance, runway, spend or error alerts" };
}

export function navBadges(notifications = buildNotifications()) {
  const badges = {};
  const add = (route, severity) => {
    const tone = severity === "critical" ? "crit" : severity === "warning" ? "warn" : "info";
    const entry = badges[route] || { count: 0, tone: "info" };
    entry.count += 1;
    if (tone === "crit" || (tone === "warn" && entry.tone === "info")) entry.tone = tone;
    badges[route] = entry;
  };
  notifications.filter((item) => item.severity !== "info").forEach((item) => {
    if (item.category === "providers") add("providers", item.severity);
    else if (item.category === "finance") add("finance", item.severity);
    else if (item.category === "operations") add("operations", item.severity);
    else if (item.category === "subscribers") add("subscribers", item.severity);
  });
  const over = usersAtRisk().filter((entry) => entry.risk === "over").length;
  if (over > 0) badges.users = { count: over, tone: "warn" };
  return badges;
}

export function describeEventLine(event) {
  return `${actionLabel(event.action)} · ${event.model || event.provider || "model unknown"}`;
}
