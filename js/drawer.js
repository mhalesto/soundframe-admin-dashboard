// Detail drawer driven by the hash (?user=, ?event=, ?provider=, ?model=, ?day=, ?entry=). Slides in from the
// right over a dimmed backdrop (a bottom sheet on phones); Escape, the close button, the backdrop and Back close it.
import { state, on } from "./store.js";
import {
  html, raw, money, unitMoney, number, formatDateTime, formatDay, timeAgo, accountLabel, planLabel, authProviderLabel,
  actionLabel, kindLabel, providerId, PROVIDER_NAMES, PROVIDER_FULL_NAMES, PROVIDER_COLORS, PROVIDER_IDS, monthLabel, plural
} from "./format.js";
import { icon, patch, idChip, emptyState, callout, provenance, prefersReducedMotion, $ } from "./ui.js";
import {
  findUser, findEvent, findProvider, findModel, users, events, riskLevel, dailySeries, BALANCE_KIND, credential, modelKey
} from "./data.js";
import {
  usageMeter, riskBadges, eventRow, balanceBlock, runwayMeter, syncRows, statusPill, providerStatusTone, providerStatusLabel,
  toneBadge, successMarkup, outcomeBar, subscriptionSourceBadge, costCompare, providerDot
} from "./views.js";
import { closeDrawerRoute, drawerFromParams, navigate, openDrawerRoute, buildHash } from "./router.js";
import { openLimitDialog } from "./dialogs.js";
import { upsertChart, destroyChart, baseOptions, axisMoney } from "./charts.js";

const el = {
  dialog: $("#drawer"),
  eyebrow: $("#drawerEyebrow"),
  title: $("#drawerTitle"),
  actions: $("#drawerActions"),
  body: $("#drawerBody"),
  close: $("#drawerClose")
};

let current = null;
let opener = null;
let closing = false;

const renderers = {
  user: renderUser,
  event: renderEvent,
  provider: renderProvider,
  model: renderModel,
  day: renderDay,
  entry: renderAuditEntry
};

function section(title, body) {
  return html`<section class="drawer-section"><h3>${title}</h3>${body}</section>`;
}

function kv(rows, cls = "") {
  return html`<dl class="kv-grid ${cls}">${rows.filter(Boolean).map(([label, value]) => html`<div><dt>${label}</dt><dd>${value}</dd></div>`)}</dl>`;
}

function stats(items, cols = 3) {
  return html`<div class="mini-stats" style="--cols:${cols}">${items.map(([label, value, sub]) => html`<div><span>${label}</span><strong>${value}</strong>${sub ? html`<small>${sub}</small>` : ""}</div>`)}</div>`;
}

function missing(kind) {
  return {
    eyebrow: "Not found",
    title: "Nothing to show",
    body: emptyState({
      iconName: "search",
      title: `This ${kind} is not in the current data`,
      body: state.dashboard ? "It may be outside the loaded window, or the link is out of date." : "Data is still loading."
    })
  };
}

// ---------- User ----------
function renderUser(hash) {
  const user = findUser(hash);
  if (!user) return missing("user");
  const userEvents = events().filter((event) => event.uid && event.uid === user.uid);
  const risk = riskLevel(user);
  return {
    eyebrow: `User · ${planLabel(user.subscriptionProductID)}`,
    title: accountLabel(user),
    actions: html`<button class="btn btn-secondary btn-sm" type="button" data-drawer-action="edit-limits">${icon("edit")}Edit limits</button>`,
    body: html`
      <div class="drawer-badges">${subscriptionSourceBadge(user)}${riskBadges(user)}${risk === "ok" && !user.override ? toneBadge("ok", "Within limits") : ""}</div>
      ${section("Usage this billing period", html`
        <div class="drawer-meters">
          <div><span class="faint">AI credits</span>${usageMeter(user.creditsUsed, user.effectiveCreditLimit)}</div>
          <div><span class="faint">Video clips</span>${usageMeter(user.videoUsed, user.effectiveVideoLimit)}</div>
        </div>
        ${stats([
          ["Provider cost", money(user.providerCostUSD), "estimated"],
          ["Text", number(user.textUsed)],
          ["Images", number(user.imageUsed)],
          ["Captions", number(user.captionUsed)],
          ["Last model", user.lastModel || "None", user.lastProvider || ""],
          ["Last activity", user.updatedAt ? timeAgo(user.updatedAt) : "Unknown", user.updatedAt ? formatDateTime(user.updatedAt) : ""]
        ])}`)}
      ${user.override ? section("Limit override", html`${callout({
        tone: user.override.disabled ? "info" : "warn",
        iconName: "edit",
        title: user.override.disabled ? "Override paused" : "Override active",
        body: [
          user.override.creditLimitOverride !== null && user.override.creditLimitOverride !== undefined ? `Credits → ${number(user.override.creditLimitOverride)}` : "",
          user.override.videoLimitOverride !== null && user.override.videoLimitOverride !== undefined ? `Videos → ${number(user.override.videoLimitOverride)}` : "",
          user.override.note ? `“${user.override.note}”` : ""
        ].filter(Boolean).join(" · ") || "No limit values set"
      })}`) : ""}
      ${section("Identity", kv([
        ["Email", user.email || "No email on file"],
        ["Sign-in", authProviderLabel(user.authProvider)],
        ["Firebase UID", idChip(user.uid, "UID")],
        ["Subscription hash", idChip(user.quotaSubjectHash, "Subscription hash")],
        ["Plan", `${planLabel(user.subscriptionProductID)} · ${monthLabel(user.period)}`],
        ["Default limits", `${number(user.creditLimit)} credits · ${number(user.videoLimit)} clips`]
      ]))}
      ${section(`Recent events (${userEvents.length})`, userEvents.length
        ? html`<div class="panel"><div class="list">${userEvents.slice(0, 12).map((event) => eventRow(event))}</div></div>
            <a class="link-btn" href="${buildHash("events", { uid: user.uid })}">All events for this user ${icon("arrow-right")}</a>`
        : emptyState({ iconName: "events", title: "No events in the latest 80", body: "The event ledger holds the newest 80 generations across all users.", compact: true }))}
    `,
    onAction: (action) => {
      if (action === "edit-limits") openLimitDialog(user);
    }
  };
}

// ---------- Event ----------
function renderEvent(id) {
  const event = findEvent(id);
  if (!event) return missing("event");
  const user = users().find((candidate) => candidate.uid && candidate.uid === event.uid);
  const provider = providerId(event.provider);
  const undelivered = event.action === "videoUndelivered";
  return {
    eyebrow: `Event · ${kindLabel(event.usageKind)}`,
    title: actionLabel(event.action),
    body: html`
      ${undelivered ? callout({ tone: "warn", title: "Billed but never delivered", body: "The provider charged for this video job, but the creator never received it. It is excluded from delivered usage totals." }) : ""}
      ${stats([
        ["Provider cost", money(event.providerCostUSD), "estimated · list price"],
        ["AI credits", number(event.credits)],
        ["When", timeAgo(event.createdAt), formatDateTime(event.createdAt)]
      ])}
      ${section("Details", kv([
        ["Action", html`${actionLabel(event.action)} <code class="faint">${event.action}</code>`],
        ["Usage kind", kindLabel(event.usageKind)],
        ["Provider", html`${providerDot(provider)} ${PROVIDER_FULL_NAMES[provider] || event.provider || "Unknown"}`],
        ["Model", event.model ? idChip(event.model, "Model ID") : "Not recorded"],
        ["Event ID", idChip(event.id, "Event ID")],
        ["Firebase UID", event.uid ? idChip(event.uid, "UID") : "Unknown"]
      ]))}
      ${section("User", user
        ? html`<a class="list-row panel" href="${buildHash("users", { user: user.quotaSubjectHash })}"><span class="list-icon">${icon("users")}</span><span class="list-main"><strong>${accountLabel(user)}</strong><span>${planLabel(user.subscriptionProductID)} · ${number(user.creditsUsed)} credits this period</span></span>${icon("chevron-right")}</a>`
        : emptyState({ iconName: "users", title: "No usage record for this UID this period", body: "The user may have generated only in a previous month.", compact: true }))}
      ${section("Explore", html`<div class="drawer-links">
        ${event.model ? html`<a class="link-btn" href="${buildHash("events", { model: event.model })}">Events for this model ${icon("arrow-right")}</a>` : ""}
        <a class="link-btn" href="${buildHash("providers", { provider })}">${PROVIDER_NAMES[provider]} health ${icon("arrow-right")}</a>
      </div>`)}
    `
  };
}

// ---------- Provider ----------
function renderProvider(id) {
  const card = findProvider(id);
  if (!card) return state.finance ? missing("provider") : {
    eyebrow: "Provider", title: PROVIDER_FULL_NAMES[id] || id,
    body: emptyState({ iconName: "providers", title: "Provider monitoring unavailable", body: "Balances and billing status come from the finance monitor, which did not load." })
  };
  const spend = card.estimatedSpend;
  const verified = card.verifiedSpend;
  const capability = (label, entry) => html`<div class="capability"><strong>${label}: ${entry.supported ? "supported" : "not available"}</strong><span>${entry.method}</span>${entry.credentials.length ? html`<span>Credentials: ${entry.credentials.map((name, index) => html`${index ? ", " : ""}<code>${name}</code>`)}</span>` : ""}${entry.permissions ? html`<span>${entry.permissions}</span>` : ""}<span class="faint">${entry.note}</span></div>`;
  return {
    eyebrow: "Provider health",
    title: card.name,
    actions: html`<a class="btn btn-secondary btn-sm" href="${card.consoleURL}" target="_blank" rel="noopener noreferrer">${icon("external")}Console</a>`,
    body: html`
      <div class="drawer-badges">${statusPill(providerStatusTone(card), providerStatusLabel(card))}</div>
      <div class="panel"><div class="panel-body provider-drawer-balance">${balanceBlock(card)}${runwayMeter(card, state.finance?.settings)}</div></div>
      ${card.history?.length > 1 ? section("Verified balance history", html`<div class="chart-frame" style="--chart-h:150px"><canvas id="drawerBalanceChart" role="img" aria-label="Verified balance readings for ${card.name}"></canvas></div>`) : ""}
      ${section("Estimated spend", stats([
        ["Today", money(spend.todayUSD, { cents: true }), `Yesterday ${money(spend.yesterdayUSD, { cents: true })}`],
        ["Last 7 days", money(spend.last7DaysUSD, { cents: true }), `${money(spend.dailyAverage7USD, { cents: true })}/day avg`],
        ["Month to date", money(spend.monthToDateUSD, { cents: true }), `Prev month ${money(spend.previousMonthUSD, { cents: true })}`],
        ["Last 30 days", money(spend.last30DaysUSD, { cents: true }), `${plural(spend.generations30d, "generation")}`],
        ["Peak day (30d)", money(spend.peakDay30USD, { cents: true })],
        ["Capacity", card.capacity.generationsRemaining === null ? "—" : `≈${number(card.capacity.generationsRemaining)}`, card.capacity.averageCostPerGenerationUSD ? `at ${unitMoney(card.capacity.averageCostPerGenerationUSD)} each` : "no priced generations"]
      ]))}
      ${section("Billed by the provider", verified
        ? html`${stats([
            ["Billed this month", money(verified.monthToDate, { cents: true }), "verified"],
            ["Previous month", verified.previousMonth === null ? "—" : money(verified.previousMonth, { cents: true })],
            ["Tracked vs billed", card.reconciliation ? `${card.reconciliation.deltaPercent === null ? "—" : `${card.reconciliation.deltaPercent > 0 ? "+" : ""}${card.reconciliation.deltaPercent}%`}` : "—", card.reconciliation ? `${money(card.reconciliation.deltaUSD, { cents: true })} difference` : ""]
          ])}
          ${verified.breakdown?.length ? html`<div class="panel"><div class="list">${verified.breakdown.slice(0, 8).map((row) => html`<div class="list-row"><span class="list-icon">${icon("finance")}</span><span class="list-main"><strong>${row.label}</strong><span>${row.ai ? "AI usage" : "Not AI usage"}</span></span><span class="list-side"><strong>${money(row.amount, { cents: true })}</strong></span></div>`)}</div></div>` : ""}`
        : callout({ tone: "info", title: credential(card.sync.spendStatus).label, body: card.capabilities.spend.supported ? "Add billing credentials to verify this provider's spend." : card.capabilities.spend.note }))}
      ${section("Billing access", html`${syncRows(card)}
        ${card.sync.messages?.length ? html`<ul class="sync-messages">${card.sync.messages.map((message) => html`<li>${message}</li>`)}</ul>` : ""}
        ${capability("Balance", card.capabilities.balance)}
        ${capability("Spend", card.capabilities.spend)}
        <div class="drawer-links"><a class="link-btn" href="${card.docsURL}" target="_blank" rel="noopener noreferrer">Billing API docs ${icon("external")}</a></div>`)}
      ${section("Alert thresholds", kv([
        ["Warning below", money(card.thresholds.warningUSD, { cents: true })],
        ["Critical below", money(card.thresholds.criticalUSD, { cents: true })]
      ]))}
    `,
    onMount: () => {
      const canvas = document.getElementById("drawerBalanceChart");
      if (!canvas) return;
      const points = card.history;
      upsertChart(`drawer-balance-${card.id}`, canvas, () => ({
        type: "line",
        data: {
          labels: points.map((point) => formatDateTime(point.at)),
          datasets: [{ data: points.map((point) => point.availableUSD), borderColor: PROVIDER_COLORS[card.id], backgroundColor: "rgba(122,232,187,0.08)", fill: true, tension: 0.3, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }]
        },
        options: { ...baseOptions({ yFormat: axisMoney, maxTicks: 3, tooltipLabel: (context) => ` ${money(context.parsed.y, { cents: true })}` }), scales: { ...baseOptions({ yFormat: axisMoney, maxTicks: 3 }).scales, x: { display: false }, y: { ...baseOptions({ yFormat: axisMoney, maxTicks: 3 }).scales.y, beginAtZero: false } } }
      }), JSON.stringify(points));
    },
    onUnmount: () => destroyChart(`drawer-balance-${card.id}`)
  };
}

// ---------- Model ----------
function renderModel(key) {
  const row = findModel(key);
  if (!row) return missing("model");
  return {
    eyebrow: `Model · ${PROVIDER_FULL_NAMES[row.provider] || row.providerName}`,
    title: row.label,
    body: html`
      <div class="drawer-badges">${row.catalogued ? toneBadge("muted", kindLabel(row.kind)) : toneBadge("warn", "Not in the catalogue")}${row.unpriced30d ? toneBadge("warn", `${number(row.unpriced30d)} unpriced`) : ""}</div>
      ${stats([
        ["Generations (30d)", number(row.generations30d), `${number(row.generationsMonthToDate)} this month`],
        ["Spend (30d)", money(row.spend30dUSD, { cents: true }), `${money(row.spendMonthToDateUSD, { cents: true })} this month`],
        ["Capacity left", row.generationsRemaining === null ? "—" : `≈${number(row.generationsRemaining)}`, "at the provider's balance"]
      ])}
      ${section("Reliability (30 days)", html`${successMarkup(row.outcomes)}${row.outcomes ? html`<div style="margin-top:10px">${outcomeBar(row.outcomes)}</div>
        <div class="legend" style="margin-top:8px">
          <span class="legend-item"><span class="legend-swatch" style="--c:var(--ok)"></span>Succeeded <strong>${number(row.outcomes.succeeded)}</strong></span>
          <span class="legend-item"><span class="legend-swatch" style="--c:var(--crit)"></span>Failed <strong>${number(row.outcomes.failed)}</strong></span>
          <span class="legend-item"><span class="legend-swatch" style="--c:var(--text-4)"></span>Cancelled <strong>${number(row.outcomes.cancelled)}</strong></span>
          <span class="legend-item"><span class="legend-swatch" style="--c:var(--blue)"></span>In flight <strong>${number(row.outcomes.pending)}</strong></span>
        </div>` : html`<p class="panel-note" style="margin-top:8px">Synchronous models (text, captions, editor images) do not create job records, so only completed generations are counted.</p>`}`)}
      ${section("Cost per generation", kv([
        ["Recorded average", row.averageCostUSD === null ? "No priced generations" : unitMoney(row.averageCostUSD)],
        ["List estimate", row.nominalCostUSD === null ? "No list estimate" : unitMoney(row.nominalCostUSD)],
        ["Comparison", costCompare(row)],
        ["List price", row.listPrice]
      ]))}
      ${section("Details", kv([
        ["Model ID", idChip(row.model, "Model ID")],
        ["Used by", row.usedBy || "—"],
        ["Last used", row.lastUsedAt ? `${timeAgo(row.lastUsedAt)} · ${formatDateTime(row.lastUsedAt)}` : "Not in the last 30 days"]
      ]))}
      <div class="drawer-links"><a class="link-btn" href="${buildHash("events", { model: row.model })}">Events for this model ${icon("arrow-right")}</a><a class="link-btn" href="${buildHash("providers", { provider: row.provider === "other" ? "" : row.provider })}">${PROVIDER_NAMES[row.provider]} health ${icon("arrow-right")}</a></div>
    `
  };
}

// ---------- Day (chart drill-down) ----------
function renderDay(key) {
  const point = dailySeries().find((entry) => entry.key === key);
  const usageDay = (state.dashboard?.usageByDay || []).find((row) => row.day === key);
  if (!point && !usageDay) return missing("day");
  const dayEvents = events().filter((event) => String(event.createdAt).slice(0, 10) === key);
  const total = point ? Number(point.totalUSD) || 0 : Number(usageDay?.providerCostUSD) || 0;
  return {
    eyebrow: "Daily breakdown · UTC",
    title: formatDay(`${key}T00:00:00Z`, { year: true }),
    body: html`
      ${stats([
        ["AI spend", money(total, { cents: true }), point ? "estimated · all events incl. undelivered" : "delivered events"],
        ["Generations", number(point ? point.generations : usageDay?.requests), "delivered"],
        ["Videos", usageDay ? number(usageDay.videos) : "—", usageDay ? `${number(usageDay.credits)} credits` : "outside the 14-day usage window"]
      ])}
      ${point ? section("Spend by provider", html`<div class="panel"><div class="bar-list">${PROVIDER_IDS.filter((id) => (point.byProvider?.[id] || 0) > 0).map((id) => {
        const value = point.byProvider[id];
        return html`<a class="bar-row" href="${buildHash("providers", { provider: id === "other" ? "" : id })}"><span class="bar-row-title">${providerDot(id)}<span>${PROVIDER_FULL_NAMES[id]}</span></span><span class="bar-row-value">${money(value, { cents: true })}</span><span class="meter-track"><span class="meter-fill" style="--pct:${total > 0 ? (value / total) * 100 : 0}%;--fill:${PROVIDER_COLORS[id]}"></span></span><span class="bar-row-meta">${total > 0 ? Math.round((value / total) * 100) : 0}% of the day</span></a>`;
      })}</div></div>`) : ""}
      ${section(`Events in the ledger (${dayEvents.length})`, dayEvents.length
        ? html`<div class="panel"><div class="list">${dayEvents.slice(0, 15).map((event) => eventRow(event))}</div></div><a class="link-btn" href="${buildHash("events", { day: key })}">Open in Events ${icon("arrow-right")}</a>`
        : emptyState({ iconName: "events", title: "No ledger events for this day", body: "The event ledger holds only the newest 80 events, so older days show totals without individual events.", compact: true }))}
    `
  };
}

// ---------- Audit entry ----------
function renderAuditEntry(id) {
  const entry = (state.dashboard?.auditLog || []).find((candidate) => candidate.id === id);
  if (!entry) return missing("audit entry");
  const user = entry.quotaSubjectHash ? findUser(entry.quotaSubjectHash) : null;
  return {
    eyebrow: "Audit entry",
    title: entry.changes || entry.action,
    body: html`
      ${kv([
        ["Action", html`<code>${entry.action}</code>`],
        ["When", `${formatDateTime(entry.at)} · ${timeAgo(entry.at)}`],
        ["By", entry.byEmail || "Unknown admin"],
        ["Admin UID", idChip(entry.byUID, "Admin UID")],
        entry.quotaSubjectHash ? ["Subscription hash", idChip(entry.quotaSubjectHash, "Subscription hash")] : null,
        entry.note ? ["Note", entry.note] : null
      ])}
      ${entry.quotaSubjectHash ? section("Affected user", user
        ? html`<a class="list-row panel" href="${buildHash("users", { user: user.quotaSubjectHash })}"><span class="list-icon">${icon("users")}</span><span class="list-main"><strong>${accountLabel(user)}</strong><span>${planLabel(user.subscriptionProductID)}</span></span>${icon("chevron-right")}</a>`
        : emptyState({ iconName: "users", title: "No usage this period", body: "This subscriber has not used AI in the current billing month.", compact: true })) : ""}
    `
  };
}

// ---------- Open / close ----------
function render(kind, id) {
  const renderer = renderers[kind];
  if (!renderer) return;
  const view = renderer(id) || missing(kind);
  el.eyebrow.textContent = view.eyebrow || "Detail";
  el.title.textContent = view.title || "Detail";
  patch(el.actions, view.actions || "");
  patch(el.body, view.body || "");
  current?.view?.onUnmount?.();
  current = { kind, id, view };
  view.onMount?.();
}

function open(kind, id) {
  closing = false;
  el.dialog.classList.remove("is-closing");
  const same = current && current.kind === kind && current.id === id && el.dialog.open;
  render(kind, id);
  if (!el.dialog.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.dialog.showModal();
    el.body.scrollTop = 0;
    requestAnimationFrame(() => el.close.focus({ preventScroll: true }));
  } else if (!same) {
    el.body.scrollTop = 0;
  }
}

function close() {
  if (!el.dialog.open || closing) return;
  closing = true;
  const finish = () => {
    el.dialog.classList.remove("is-closing");
    el.dialog.close();
    current?.view?.onUnmount?.();
    current = null;
    closing = false;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  };
  if (prefersReducedMotion()) finish();
  else {
    el.dialog.classList.add("is-closing");
    setTimeout(finish, 190);
  }
}

export function syncDrawer() {
  const target = drawerFromParams();
  if (target && state.auth === "ready") open(target.kind, target.id);
  else close();
}

export function refreshDrawer() {
  if (current && el.dialog.open && !closing) {
    const scroll = el.body.scrollTop;
    render(current.kind, current.id);
    el.body.scrollTop = scroll;
  }
}

export function isDrawerOpen() {
  return el.dialog.open;
}

export function initDrawer() {
  el.close.addEventListener("click", () => closeDrawerRoute());
  el.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDrawerRoute();
  });
  el.dialog.addEventListener("click", (event) => {
    if (event.target === el.dialog) closeDrawerRoute();
  });
  el.actions.addEventListener("click", (event) => {
    const action = event.target.closest("[data-drawer-action]");
    if (action) current?.view?.onAction?.(action.dataset.drawerAction);
  });
  // Drill-down links inside the drawer navigate the page; close the drawer first so Back behaves.
  el.body.addEventListener("click", (event) => {
    const openEvent = event.target.closest("[data-open-event]");
    if (openEvent) {
      event.preventDefault();
      openDrawerRoute("event", openEvent.dataset.openEvent);
    }
  });
  on("route", syncDrawer);
  on("data", refreshDrawer);
}

export { navigate, modelKey, BALANCE_KIND, provenance, raw };
