// Markup fragments shared by pages and drawers.
import {
  html, raw, money, unitMoney, number, percent, formatDateTime, formatDay, timeAgo, accountLabel, accountMeta, planLabel,
  actionLabel, kindLabel, providerId, PROVIDER_COLORS, PROVIDER_NAMES, ratioPercent, shortID
} from "./format.js";
import { icon, meter, provenance, idChip } from "./ui.js";
import { riskLevel, BALANCE_KIND, credential, subscriptionSource } from "./data.js";

export function providerDot(id) {
  return html`<span class="dot-inline" style="--c:${PROVIDER_COLORS[id] || PROVIDER_COLORS.other}" aria-hidden="true"></span>`;
}

export function statusPill(tone, label) {
  return html`<span class="status-pill" data-tone="${tone}"><span class="dot" aria-hidden="true"></span>${label}</span>`;
}

export function toneBadge(tone, label, iconName = "") {
  const cls = { ok: "badge-ok", warn: "badge-warn", crit: "badge-crit", info: "badge-info", muted: "", mint: "badge-mint", lavender: "badge-lavender" }[tone] || "";
  return html`<span class="badge ${cls}">${iconName ? icon(iconName) : ""}${label}</span>`;
}

export function riskBadges(user) {
  const risk = riskLevel(user);
  return html`${risk === "over" ? toneBadge("crit", "Over limit") : risk === "near" ? toneBadge("warn", "Near limit") : ""}${user.override ? (user.override.disabled ? toneBadge("muted", "Override paused") : toneBadge("lavender", "Override")) : ""}`;
}

export function userCell(user, { showPlan = false } = {}) {
  return html`<div class="cell-main"><strong>${accountLabel(user)}</strong><span class="cell-sub">${showPlan ? `${planLabel(user.subscriptionProductID)} · ` : ""}${accountMeta(user)}</span></div>`;
}

export function usageMeter(used, limit) {
  const pct = ratioPercent(used, limit);
  const tone = pct >= 100 ? "crit" : pct >= 90 ? "warn" : "";
  return html`<div class="meter"><div class="meter-head"><span>${number(used)} / ${number(limit)}</span><span>${pct}%</span></div>${meter(pct, tone)}</div>`;
}

export function successMarkup(outcomes, { compact = false } = {}) {
  if (!outcomes) return html`<span class="faint" data-tip="Job outcomes are tracked for async video, 3D and Studio image jobs only">Not tracked</span>`;
  const finished = outcomes.succeeded + outcomes.failed;
  if (outcomes.successRate === null) {
    return outcomes.pending ? html`<span class="badge badge-info">${number(outcomes.pending)} running</span>` : html`<span class="faint">—</span>`;
  }
  const tone = outcomes.successRate >= 95 ? "ok" : outcomes.successRate >= 80 ? "warn" : "crit";
  const extra = [outcomes.cancelled ? `${number(outcomes.cancelled)} cancelled` : "", outcomes.pending ? `${number(outcomes.pending)} running` : ""].filter(Boolean).join(" · ");
  return html`<div class="cell-main">${toneBadge(tone, `${outcomes.successRate}%`)}${compact ? "" : html`<span class="cell-sub">${number(outcomes.succeeded)}/${number(finished)} succeeded${extra ? ` · ${extra}` : ""}</span>`}</div>`;
}

export function outcomeBar(outcomes) {
  if (!outcomes) return html`<span class="faint">Not tracked</span>`;
  const parts = [
    ["succeeded", "var(--ok)"],
    ["failed", "var(--crit)"],
    ["cancelled", "var(--text-4)"],
    ["pending", "var(--blue)"]
  ].filter(([key]) => outcomes[key] > 0);
  return html`<div class="stack-bar" role="img" aria-label="${number(outcomes.succeeded)} succeeded, ${number(outcomes.failed)} failed, ${number(outcomes.cancelled)} cancelled, ${number(outcomes.pending)} running">${parts.map(([key, color]) => html`<span style="--c:${color};flex-grow:${outcomes[key]}"></span>`)}</div>`;
}

export function eventIconTone(event) {
  if (event.action === "videoUndelivered") return ["alert", "warn"];
  return {
    video: ["events", "mint"],
    image: ["ai", "lavender"],
    caption: ["events", "info"],
    text: ["ai", "info"]
  }[event.usageKind] || ["events", ""];
}

export function eventRow(event, { button = true } = {}) {
  const [glyph, tone] = eventIconTone(event);
  const provider = providerId(event.provider);
  const inner = html`
    <span class="list-icon" data-tone="${tone}">${icon(glyph)}</span>
    <span class="list-main"><strong>${actionLabel(event.action)}</strong><span>${providerDot(provider)} ${PROVIDER_NAMES[provider] || event.provider || "Unknown"} · ${event.model || "model not recorded"}</span></span>
    <span class="list-side"><strong>${event.action === "videoUndelivered" ? `${money(event.providerCostUSD)} lost` : money(event.providerCostUSD)}</strong><span>${timeAgo(event.createdAt)}</span></span>`;
  return button
    ? html`<button class="list-row" type="button" data-open-event="${event.id}">${inner}</button>`
    : html`<div class="list-row">${inner}</div>`;
}

export function balanceBlock(card) {
  const balance = card.balance;
  const kind = BALANCE_KIND[balance.kind] || BALANCE_KIND.unavailable;
  const asOf = balance.asOf
    ? `${balance.kind === "manual_estimate" ? "Recorded" : "As of"} ${formatDateTime(balance.asOf)}`
    : card.capabilities.balance.supported ? "Not synced yet" : "No balance API";
  return html`<div class="balance-block">
    <div class="balance-top">${provenance(kind.cls.replace("prov-", ""), kind.label, kind.hint)}<span class="faint">${asOf}</span></div>
    <div class="balance-value${balance.availableUSD === null ? " is-unavailable" : ""}">${balance.availableUSD === null ? "Unavailable" : money(balance.availableUSD, { cents: true })}</div>
    <div class="faint balance-detail">${balance.kind === "manual_estimate" && balance.manual
      ? `${money(balance.manual.amountUSD, { cents: true })} recorded − ${money(balance.manual.spentSinceUSD, { cents: true })} tracked since`
      : balance.kind === "verified" || balance.kind === "stale"
        ? `Cash ${balance.cashUSD === null ? "—" : money(balance.cashUSD, { cents: true })} · Credit ${balance.creditUSD === null ? "—" : money(balance.creditUSD, { cents: true })}${balance.currencyReported ? "" : ` · ${balance.currency} assumed`}`
        : card.capabilities.balance.note}</div>
  </div>`;
}

export function runwayMeter(card, settings) {
  const days = card.runway.days;
  if (days === null) {
    return html`<div class="runway"><div class="meter-head"><span>Runway</span><span class="faint">${card.balance.availableUSD === null ? "Needs a balance" : "No recent spend"}</span></div>${meter(0)}</div>`;
  }
  const warning = settings?.runway?.warningDays || 14;
  const critical = settings?.runway?.criticalDays || 5;
  const tone = days <= critical ? "crit" : days <= warning ? "warn" : "";
  const pct = Math.min(100, (days / Math.max(warning * 2, 30)) * 100);
  return html`<div class="runway"><div class="meter-head"><span>Runway</span><span><strong class="num">${days < 10 ? days.toFixed(1) : Math.round(days)} days</strong> · until ${formatDay(card.runway.exhaustionDate)}</span></div>${meter(pct, tone)}<span class="faint runway-basis">${money(card.runway.burnPerDayUSD, { cents: true })}/day · ${card.runway.basis}</span></div>`;
}

export function syncRows(card) {
  const balance = credential(card.sync.balanceStatus);
  const spend = credential(card.sync.spendStatus);
  return html`<div class="sync-rows">
    <div><span class="faint">Balance API</span>${toneBadge(balance.tone, balance.label)}</div>
    <div><span class="faint">Spend API</span>${toneBadge(spend.tone, spend.label)}</div>
    <div><span class="faint">Last success</span><span>${card.sync.lastSuccessAt ? timeAgo(card.sync.lastSuccessAt) : "Never"}</span></div>
  </div>`;
}

export function providerStatusTone(card) {
  return { ok: "ok", warning: "warn", critical: "crit", unavailable: "muted" }[card.status] || "muted";
}

export function providerStatusLabel(card) {
  return { ok: "Healthy", warning: "Warning", critical: "Critical", unavailable: "No balance data" }[card.status] || card.status;
}

export function subscriptionSourceBadge(user) {
  return subscriptionSource(user) === "internal-test"
    ? toneBadge("muted", "Internal test")
    : html`<span class="badge badge-mint" data-tip="Apple verified this subscription for this Firebase UID at its last AI request">${icon("link")}Linked</span>`;
}

export function modelCell(row) {
  return html`<div class="cell-main"><strong>${row.label}${row.catalogued ? "" : raw(" ")}${row.catalogued ? "" : toneBadge("warn", "Uncatalogued")}</strong><span class="cell-sub">${providerDot(row.provider)} ${PROVIDER_NAMES[row.provider] || row.providerName} · ${kindLabel(row.kind)}</span></div>`;
}

export function costCompare(row) {
  if (row.averageCostUSD === null && row.nominalCostUSD === null) return html`<span class="faint">—</span>`;
  if (row.averageCostUSD === null) return html`<div class="cell-main"><span>${unitMoney(row.nominalCostUSD)}</span><span class="cell-sub">list estimate · none recorded</span></div>`;
  if (row.nominalCostUSD === null) return html`<div class="cell-main"><span>${unitMoney(row.averageCostUSD)}</span><span class="cell-sub">recorded · no list price</span></div>`;
  const diff = row.nominalCostUSD > 0 ? ((row.averageCostUSD - row.nominalCostUSD) / row.nominalCostUSD) * 100 : 0;
  const flag = Math.abs(diff) >= 15;
  return html`<div class="cell-main"><span>${unitMoney(row.averageCostUSD)} <span class="faint">vs ${unitMoney(row.nominalCostUSD)}</span></span><span class="cell-sub${flag ? " negative" : ""}">${Math.abs(diff) < 0.5 ? "matches list" : `${diff > 0 ? "+" : ""}${diff.toFixed(0)}% vs list`}</span></div>`;
}

export function shortHash(value) {
  return shortID(value, 6);
}

export { idChip, percent };

/**
 * Actions for a provider balance alert: open the provider's billing console in a new tab, and (for providers
 * without a balance API) record the balance shown there as a manual balance.
 */
export function balanceActions(card, { details = false } = {}) {
  if (!card) return "";
  // A manual balance is the fallback whenever no verified reading exists (no API, or credentials not set up yet).
  const manual = card.balance.kind === "unavailable" || card.balance.kind === "manual_estimate";
  return html`<span class="alert-actions">
    <a class="link-btn" href="${card.consoleURL}" target="_blank" rel="noopener noreferrer" aria-label="Open the ${card.name} console in a new tab">Console ${icon("external")}</a>
    ${manual ? html`<button class="link-btn" type="button" data-record-balance="${card.id}">${card.balance.kind === "manual_estimate" ? "Update balance" : "Record balance"}</button>` : ""}
    ${details ? html`<a class="link-btn" href="#providers?provider=${card.id}">Details ${icon("arrow-right")}</a>` : ""}
  </span>`;
}
