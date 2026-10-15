// Finance: revenue, AI spend, margins, plan profitability and tracked cost detail. Tabs keep each job on one
// screen; ?tab= deep-links them.
import { state, prefs, savePrefs } from "../store.js";
import {
  html, money, unitMoney, number, percent, plural, formatDay, timeAgo, monthLabel, accountLabel, planLabel, PROVIDER_IDS,
  PROVIDER_COLORS, PROVIDER_NAMES, PROVIDER_FULL_NAMES, shortID
} from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, callout, provenance, deltaBadge, meter, syncSegmented, idChip } from "../ui.js";
import { rangeSummary, deltaInfo, resolveRange, models, modelKey, users, findUser, isPending } from "../data.js";
import { providerDot, toneBadge, balanceActions } from "../views.js";
import { upsertChart, baseOptions, axisMoney, CHART_COLORS } from "../charts.js";
import { setParams, openDrawerRoute, buildHash } from "../router.js";
import { openFinanceSettings } from "../dialogs.js";
import { downloadCSV } from "../csv.js";

const TABS = [
  { id: "spend", label: "Spend" },
  { id: "revenue", label: "Revenue & margin" },
  { id: "plans", label: "Plans" },
  { id: "detail", label: "Cost detail" }
];

let root;
let granularity = "daily";
let actions = { sync: () => {} };
let lastTab = null;

function activeTab() {
  const tab = state.route.params.get("tab") || prefs.financeTab;
  return TABS.some((entry) => entry.id === tab) ? tab : "spend";
}

function layout() {
  return html`
    ${pageHeader({ id: "finance", title: "Finance", actions: html`
      <button class="btn btn-secondary" type="button" data-finance-settings>${icon("settings")}Settings</button>
      <button class="btn btn-primary" type="button" data-finance-sync>${icon("refresh")}<span>Sync balances</span></button>` })}
    <div data-slot="alerts" class="alert-stack"></div>
    <div class="metric-strip" style="--cols:5" data-slot="strip">
      ${["revenue", "mtd", "projected", "margin", "billed"].map((key) => html`<div class="metric" data-metric="${key}"><span class="metric-label"><span data-slot="${key}-label"></span><span data-slot="${key}-prov"></span></span><span class="metric-value num" data-slot="${key}-value">—</span><span class="metric-sub" data-slot="${key}-sub"></span></div>`)}
    </div>
    <div class="tabs" role="tablist" aria-label="Finance views" data-slot="tabs">
      ${TABS.map((tab) => html`<button class="tab" type="button" role="tab" id="fin-tab-${tab.id}" aria-controls="fin-panel-${tab.id}" aria-selected="false" data-tab="${tab.id}">${tab.label}</button>`)}
    </div>
    <div class="tab-panel" role="tabpanel" id="fin-panel-spend" aria-labelledby="fin-tab-spend" data-panel="spend" hidden>
      <div class="grid">
        <section class="panel span-8">
          <header class="panel-head">
            <div class="panel-title"><h2>Spending by provider</h2><p data-slot="spend-sub"></p></div>
            <div class="panel-tools"><div class="segmented" role="group" aria-label="Granularity" data-slot="granularity">
              <button type="button" data-granularity="daily" aria-pressed="true">Daily</button>
              <button type="button" data-granularity="weekly" aria-pressed="false">Weekly</button>
              <button type="button" data-granularity="monthly" aria-pressed="false">Monthly</button>
            </div></div>
          </header>
          <div class="panel-body">
            <div class="legend" data-slot="spend-legend"></div>
            <div class="chart-frame" style="--chart-h:280px"><canvas data-slot="spend-chart" role="img" aria-label="AI generation spending by provider over time"></canvas></div>
            <div class="chart-summary" data-slot="spend-summary"></div>
          </div>
        </section>
        <section class="panel span-4">
          <header class="panel-head"><div class="panel-title"><h2>Provider mix</h2><p>This month · estimated</p></div></header>
          <div class="bar-list" data-slot="mix"></div>
          <div class="panel-body" data-slot="today"></div>
        </section>
        <section class="panel span-12">
          <header class="panel-head"><div class="panel-title"><h2>Most expensive models</h2><p>Last 30 days · click a model for reliability and capacity</p></div><a class="link-btn" href="#operations">All models ${icon("arrow-right")}</a></header>
          <div class="bar-list two-col" data-slot="top-models"></div>
        </section>
      </div>
    </div>
    <div class="tab-panel" role="tabpanel" id="fin-panel-revenue" aria-labelledby="fin-tab-revenue" data-panel="revenue" hidden>
      <div class="grid">
        <section class="panel span-8">
          <header class="panel-head"><div class="panel-title"><h2>Revenue vs AI generation cost</h2><p>Last 6 months · USD</p></div></header>
          <div class="panel-body">
            <div class="legend" data-slot="rev-legend"></div>
            <div class="chart-frame" style="--chart-h:280px"><canvas data-slot="rev-chart" role="img" aria-label="Monthly subscription revenue compared with AI generation cost"></canvas></div>
            <p class="panel-note" data-slot="rev-note"></p>
          </div>
        </section>
        <section class="panel span-4">
          <header class="panel-head"><div class="panel-title"><h2>This month</h2><p data-slot="month-sub"></p></div></header>
          <div class="panel-body" data-slot="month"></div>
        </section>
        <section class="panel span-12">
          <header class="panel-head"><div class="panel-title"><h2>Tracked vs billed</h2><p>SoundFrame's estimates against provider billing, month to date</p></div></header>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Provider</th><th class="num">Tracked (estimated)</th><th class="num">Billed (verified)</th><th class="num">Difference</th><th>Status</th></tr></thead><tbody data-slot="recon"></tbody></table></div>
        </section>
      </div>
    </div>
    <div class="tab-panel" role="tabpanel" id="fin-panel-plans" aria-labelledby="fin-tab-plans" data-panel="plans" hidden>
      <section class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Profitability by plan</h2><p>This month · estimated</p></div></header>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Plan</th><th class="num">Net / mo</th><th class="num">Paying</th><th class="num">Revenue</th><th class="num">AI cost</th><th class="num">Margin</th><th class="num">Full-allowance cost</th></tr></thead><tbody data-slot="plans"></tbody></table></div>
        <footer class="panel-foot"><p class="panel-note" data-slot="plans-note"></p></footer>
      </section>
      <section class="panel">
        <header class="panel-head"><div class="panel-title"><h2>Recommendations</h2><p>Safeguards computed from balances, burn and plan allowances</p></div></header>
        <div class="panel-body"><div class="recommendations" data-slot="recs"></div>
          <details class="notes-details"><summary>How these numbers are calculated</summary><ul data-slot="notes"></ul></details>
        </div>
      </section>
    </div>
    <div class="tab-panel" role="tabpanel" id="fin-panel-detail" aria-labelledby="fin-tab-detail" data-panel="detail" hidden>
      <div class="metric-strip" style="--cols:4" data-slot="detail-strip"></div>
      <div class="grid">
        <section class="panel span-8">
          <header class="panel-head"><div class="panel-title"><h2>Provider cost per day</h2><p data-slot="cost-sub">Last 14 days · delivered generations</p></div></header>
          <div class="panel-body">
            <div class="chart-frame" style="--chart-h:240px"><canvas data-slot="cost-chart" role="img" aria-label="Provider cost per day over the last 14 days"></canvas></div>
            <div class="chart-summary" data-slot="cost-summary"></div>
          </div>
        </section>
        <section class="panel span-4">
          <header class="panel-head"><div class="panel-title"><h2>Unit economics</h2><p>Efficiency of AI spend</p></div></header>
          <div class="list" data-slot="unit"></div>
        </section>
        <section class="panel span-6">
          <header class="panel-head"><div class="panel-title"><h2>Cost by provider</h2><p>Last 14 days</p></div></header>
          <div class="table-scroll"><table class="data-table"><thead><tr><th>Provider</th><th class="num">Requests</th><th class="num">Cost</th><th class="num">Cost / req</th></tr></thead><tbody data-slot="by-provider"></tbody></table></div>
        </section>
        <section class="panel span-6">
          <header class="panel-head"><div class="panel-title"><h2>Cost by model</h2><p>Last 14 days</p></div></header>
          <div class="table-scroll table-tall"><table class="data-table"><thead><tr><th>Model</th><th class="num">Requests</th><th class="num">Credits</th><th class="num">Cost</th><th class="num">Cost / req</th></tr></thead><tbody data-slot="by-model"></tbody></table></div>
        </section>
        <section class="panel span-6">
          <header class="panel-head"><div class="panel-title"><h2>Undelivered video spend</h2><p data-slot="leak-sub"></p></div><a class="link-btn" href="#operations?tab=undelivered">Jobs ${icon("arrow-right")}</a></header>
          <div class="panel-body" data-slot="leak"></div>
        </section>
        <section class="panel span-6">
          <header class="panel-head"><div class="panel-title"><h2>Cost by user</h2><p data-slot="users-sub">This billing month</p></div>
            <button class="btn btn-secondary btn-sm" type="button" data-export-cost>${icon("download")}Export CSV</button></header>
          <div class="table-scroll table-tall"><table class="data-table"><thead><tr><th>Account</th><th>Plan</th><th class="num">Credits</th><th class="num">Cost</th><th class="num">Cost / credit</th></tr></thead><tbody data-slot="cost-users"></tbody></table></div>
        </section>
      </div>
    </div>`;
}

// ---------- Header, alerts, strip ----------
function renderHeader() {
  const finance = state.finance;
  const attempts = (finance?.providers || []).map((card) => Date.parse(card.sync.lastAttemptAt)).filter(Number.isFinite);
  patch(slot(root, "meta"), finance
    ? html`<span>${attempts.length ? `Billing synced ${timeAgo(Math.max(...attempts))}` : "Billing never synced"}</span><span class="faint">·</span><span>auto-sync every 6 hours</span><span class="faint">·</span><span>figures computed ${timeAgo(finance.generatedAt)}</span><span class="faint">·</span>${provenance("estimated", "Estimated")}${provenance("verified", "Verified")}${provenance("manual", "Manual")}`
    : html`<span>Revenue, AI spend and margins</span>`);
  root.querySelectorAll("[data-finance-settings], [data-finance-sync]").forEach((button) => { button.disabled = !finance; });
}

export function financeUnavailable() {
  const error = state.financeError;
  if (state.financeLoading && !state.finance) {
    return html`<div class="panel"><div class="panel-body" style="display:grid;gap:12px"><span class="skeleton sk-line" style="width:30%"></span><span class="skeleton sk-chart"></span></div></div>`;
  }
  if (!error) return "";
  if (error.kind === "permission") {
    return callout({ tone: "warn", iconName: "access", title: "Permission required", body: "This admin account is not allowed to read the finance monitor. Balances, spend history and margins stay hidden." });
  }
  if (error.kind === "missing") {
    return callout({ tone: "info", title: "Provider monitoring is not deployed yet", body: "Deploy the functions build that adds soundframeAdminFinanceMonitor, then refresh. Until then the Cost detail tab uses the dashboard's own 14-day event window." });
  }
  return callout({ tone: "warn", title: "Provider monitoring could not be loaded", body: `${error.message} Figures that depend on it show as unavailable; nothing is shown as zero.`, action: html`<button class="btn btn-secondary btn-sm" type="button" data-retry-finance>Retry</button>` });
}

function cardFor(id) {
  return (state.finance?.providers || []).find((card) => card.id === id) || null;
}

function renderAlerts() {
  const finance = state.finance;
  if (!finance) {
    patch(slot(root, "alerts"), state.financeError ? financeUnavailable() : html`<div class="alert-bar is-loading"><span class="skeleton sk-line" style="width:40%"></span></div>`);
    return;
  }
  const alerts = finance.alerts || [];
  const urgent = alerts.filter((alert) => alert.severity !== "info");
  const notes = alerts.filter((alert) => alert.severity === "info");
  const critical = urgent.some((alert) => alert.severity === "critical");
  const tone = critical ? "crit" : urgent.length ? "warn" : "ok";
  const titles = {
    low_balance: "Low balance", projected_exhaustion: "Runway", sync_error: "Billing sync failed", stale_sync: "Stale billing data",
    spend_spike: "Unusual spend", negative_margin: "Negative margin"
  };
  const summary = urgent.length
    ? urgent.map((alert) => `${titles[alert.kind] || "Alert"}${alert.provider ? ` (${PROVIDER_NAMES[alert.provider]})` : ""}`).join(" · ")
    : "No balance, runway or spending alerts. Thresholds are set in Finance settings.";
  patch(slot(root, "alerts"), html`<details class="alert-bar" data-tone="${tone}">
    <summary>
      ${icon(tone === "crit" ? "critical" : tone === "warn" ? "alert" : "ok")}
      <span class="alert-bar-text"><strong>${urgent.length ? `${plural(urgent.length, "alert")} need attention` : "All clear"}</strong><span>${summary}</span></span>
      <span class="alert-bar-more">${urgent.length || notes.length ? html`Details${notes.length ? ` · ${plural(notes.length, "note")}` : ""}${icon("chevron-down")}` : ""}</span>
    </summary>
    <div class="alert-bar-body">
      ${urgent.map((alert) => html`<div class="alert-line" data-tone="${alert.severity === "critical" ? "crit" : "warn"}">${icon(alert.severity === "critical" ? "critical" : "alert")}<span>${alert.message}</span>${alert.provider ? balanceActions(cardFor(alert.provider), { details: true }) : html`<span></span>`}</div>`)}
      ${notes.map((alert) => html`<div class="alert-line" data-tone="info">${icon("info")}<span>${alert.message}</span>${alert.provider ? balanceActions(cardFor(alert.provider)) : html`<span></span>`}</div>`)}
    </div>
  </details>`);
}

function cell(key, { label, value, format, unavailable, prov = "", sub = "", tone = "" }) {
  const metric = root.querySelector(`[data-metric="${key}"]`);
  if (tone) metric.dataset.tone = tone;
  else delete metric.dataset.tone;
  patch(slot(root, `${key}-label`), label);
  setValue(slot(root, `${key}-value`), `finance.${key}`, value, format, { pending: isPending(), unavailable });
  patch(slot(root, `${key}-prov`), prov);
  patch(slot(root, `${key}-sub`), sub);
}

function renderStrip() {
  const finance = state.finance;
  const overview = finance?.overview;
  const spend = overview?.estimatedSpend;
  const revenue = overview?.revenue;
  const cents = (value) => money(value, { cents: true });
  cell("revenue", {
    label: "Subscription revenue",
    value: revenue ? revenue.monthUSD : null,
    format: cents,
    unavailable: revenue?.basis === "none" ? "No revenue yet" : "Unavailable",
    prov: !revenue ? provenance("unavailable", "Unavailable") : revenue.basis === "manual" ? provenance("manual", "Manual") : provenance("estimated", "Estimated"),
    sub: revenue ? (revenue.basis === "manual" ? "Net proceeds from App Store Connect" : `${number(revenue.payingSubscribers)} paying${revenue.testSubscribers ? `, ${number(revenue.testSubscribers)} test excluded` : ""} · lower bound`) : ""
  });
  cell("mtd", {
    label: "AI spend · month to date",
    value: spend ? spend.monthToDateUSD : null,
    format: cents,
    prov: spend ? provenance("estimated", "Estimated") : provenance("unavailable", "Unavailable"),
    sub: spend ? `Today ${cents(spend.todayUSD)} · yesterday ${cents(spend.yesterdayUSD)}` : ""
  });
  cell("projected", {
    label: "Projected month-end cost",
    value: overview ? overview.projectedMonthCostUSD : null,
    format: cents,
    prov: overview ? provenance("estimated", "Projected") : provenance("unavailable", "Unavailable"),
    sub: spend ? `At ${cents(spend.dailyAverage7USD)}/day (7-day average)` : ""
  });
  cell("margin", {
    label: "Estimated gross margin",
    value: overview ? overview.grossMarginUSD : null,
    format: cents,
    unavailable: overview ? "Needs revenue" : "Unavailable",
    tone: overview?.grossMarginUSD !== null && overview?.grossMarginUSD < 0 ? "crit" : overview?.grossMarginPercent !== null && overview?.grossMarginPercent < 30 ? "warn" : "",
    prov: overview ? provenance("estimated", "Projected") : provenance("unavailable", "Unavailable"),
    sub: overview ? (overview.grossMarginPercent === null ? "Needs revenue and cost data" : `${percent(overview.grossMarginPercent)} of revenue after projected AI cost`) : ""
  });
  cell("billed", {
    label: "Billed this month",
    value: overview ? overview.verifiedSpendMonthToDateUSD : null,
    format: cents,
    unavailable: overview ? "Not connected" : "Unavailable",
    prov: overview?.verifiedSpendMonthToDateUSD !== null && overview ? provenance("verified", "Verified") : provenance("unavailable", overview ? "No billing API" : "Unavailable"),
    sub: overview ? (overview.verifiedSpendProviders.length ? `${overview.verifiedSpendProviders.map((id) => PROVIDER_NAMES[id]).join(", ")} only` : "Add billing credentials to verify") : ""
  });
}

// ---------- Tabs ----------
function renderTabs() {
  const tab = activeTab();
  const tablist = slot(root, "tabs");
  tablist.querySelectorAll("[data-tab]").forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  syncSegmented(tablist);
  root.querySelectorAll("[data-panel]").forEach((panelElement) => {
    const show = panelElement.dataset.panel === tab;
    if (show && panelElement.hidden) {
      panelElement.hidden = false;
      if (lastTab !== null) {
        panelElement.classList.remove("is-entering");
        void panelElement.offsetWidth;
        panelElement.classList.add("is-entering");
      }
    } else if (!show) {
      panelElement.hidden = true;
    }
  });
  lastTab = tab;
  return tab;
}

// ---------- Spend tab ----------
function renderSpend() {
  const finance = state.finance;
  if (!finance) {
    patch(slot(root, "spend-sub"), "Unavailable");
    patch(slot(root, "spend-legend"), "");
    patch(slot(root, "spend-summary"), emptyState({ iconName: "finance", title: "Spend history unavailable", body: "It comes from the provider monitor.", compact: true }));
    patch(slot(root, "mix"), "");
    patch(slot(root, "today"), "");
    patch(slot(root, "top-models"), "");
    return;
  }
  syncSegmented(slot(root, "granularity"));
  const compare = prefs.compare && granularity === "daily";
  let points;
  let previousValues = null;
  let subtitle;
  if (granularity === "daily") {
    const summary = rangeSummary();
    points = summary.points.map((point) => ({ ...point, label: formatDay(point.date) }));
    previousValues = points.map((_, index) => summary.previousPoints[index] ? Number(summary.previousPoints[index].totalUSD) || 0 : null);
    subtitle = `${summary.range.label} · ${summary.range.short} · estimated${compare ? ` · vs ${summary.previous.short}` : ""}`;
  } else {
    points = (finance.series[granularity] || []).map((point) => ({ ...point, label: `${granularity === "monthly" ? monthLabel(point.label).replace(/ \d{4}$/, "") : `Wk ${formatDay(point.start)}`}${point.partial ? "*" : ""}` }));
    subtitle = granularity === "weekly" ? "Last 26 weeks · estimated · * partial week" : "Last 6 months · estimated · * month starts before the event window";
  }
  patch(slot(root, "spend-sub"), subtitle);
  const used = PROVIDER_IDS.filter((id) => points.some((point) => (point.byProvider?.[id] || 0) > 0));
  const datasets = (used.length ? used : ["byteplus"]).map((id) => ({
    type: "bar", label: PROVIDER_NAMES[id], data: points.map((point) => point.byProvider?.[id] || 0), backgroundColor: PROVIDER_COLORS[id],
    borderRadius: 3, borderSkipped: false, maxBarThickness: granularity === "daily" ? 18 : 30, stack: "spend", order: 2
  }));
  if (compare) {
    datasets.push({ type: "line", label: "Previous period", data: previousValues, borderColor: CHART_COLORS.compare, borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.25, spanGaps: true, order: 1, stack: "compare" });
  }
  patch(slot(root, "spend-legend"), html`${used.map((id) => html`<span class="legend-item"><span class="legend-swatch" style="--c:${PROVIDER_COLORS[id]}"></span>${PROVIDER_NAMES[id]}</span>`)}${compare ? html`<span class="legend-item"><span class="legend-swatch is-dashed" style="--c:${CHART_COLORS.compare}"></span>Previous period</span>` : ""}`);
  upsertChart("finance-spend", slot(root, "spend-chart"), () => ({
    type: "bar",
    data: { labels: points.map((point) => point.label), datasets },
    options: baseOptions({
      stacked: true,
      yFormat: axisMoney,
      tooltipLabel: (context) => ` ${context.dataset.label}: ${context.parsed.y === null ? "—" : money(context.parsed.y, { cents: true })}`,
      onClick: granularity === "daily" ? (event, elements) => { if (elements[0]) openDrawerRoute("day", points[elements[0].index].key); } : undefined
    })
  }), JSON.stringify([granularity, compare, points.map((point) => [point.label, point.totalUSD]), previousValues]));
  const total = points.reduce((sum, point) => sum + (Number(point.totalUSD) || 0), 0);
  const peak = Math.max(0, ...points.map((point) => Number(point.totalUSD) || 0));
  const generations = points.reduce((sum, point) => sum + (Number(point.generations) || 0), 0);
  patch(slot(root, "spend-summary"), html`<span><strong>${money(total, { cents: true })}</strong>total</span><span><strong>${money(peak, { cents: true })}</strong>peak ${granularity === "daily" ? "day" : granularity === "weekly" ? "week" : "month"}</span><span><strong>${number(generations)}</strong>generations</span>`);

  const mix = finance.providers.map((card) => ({ id: card.id, value: Number(card.estimatedSpend.monthToDateUSD) || 0 }));
  const other = finance.series.monthly.at(-1)?.byProvider?.other || 0;
  if (other > 0) mix.push({ id: "other", value: other });
  mix.sort((lhs, rhs) => rhs.value - lhs.value);
  const mixTotal = mix.reduce((sum, entry) => sum + entry.value, 0);
  patch(slot(root, "mix"), mixTotal > 0 ? mix.map((entry) => html`<a class="bar-row" href="${entry.id === "other" ? "#finance?tab=spend" : buildHash("providers", { provider: entry.id })}"><span class="bar-row-title">${providerDot(entry.id)}<span>${PROVIDER_FULL_NAMES[entry.id]}</span></span><span class="bar-row-value">${money(entry.value, { cents: true })}</span><span class="meter-track"><span class="meter-fill" style="--pct:${(entry.value / mixTotal) * 100}%;--fill:${PROVIDER_COLORS[entry.id]}"></span></span><span class="bar-row-meta">${Math.round((entry.value / mixTotal) * 100)}% of this month</span></a>`.value).join("") : emptyState({ iconName: "finance", title: "No spend this month yet", compact: true }));
  const spend = finance.overview.estimatedSpend;
  patch(slot(root, "today"), html`<div class="mini-stats" style="--cols:2">
    <div><span>Today</span><strong>${money(spend.todayUSD, { cents: true })}</strong><small>UTC day so far</small></div>
    <div><span>7-day average</span><strong>${money(spend.dailyAverage7USD, { cents: true })}</strong><small>30-day ${money(spend.dailyAverage30USD, { cents: true })}</small></div>
    <div><span>Last 30 days</span><strong>${money(spend.last30DaysUSD, { cents: true })}</strong><small>peak day ${money(spend.peakDay30USD, { cents: true })}</small></div>
    <div><span>Previous month</span><strong>${money(spend.previousMonthUSD, { cents: true })}</strong>${spend.previousMonthUSD > 0 ? html`<small>${deltaBadge(deltaInfo(spend.monthToDateUSD, spend.previousMonthUSD), { goodWhenUp: false })} month to date</small>` : ""}</div>
  </div>`);

  const top = models().filter((row) => row.spend30dUSD > 0).slice(0, 8);
  const max = Math.max(...top.map((row) => row.spend30dUSD), 0.0001);
  patch(slot(root, "top-models"), top.length ? top.map((row) => html`<button class="bar-row" type="button" data-open-model="${modelKey(row)}"><span class="bar-row-title">${providerDot(row.provider)}<span>${row.label}</span></span><span class="bar-row-value">${money(row.spend30dUSD, { cents: true })}</span><span class="meter-track"><span class="meter-fill" style="--pct:${(row.spend30dUSD / max) * 100}%;--fill:${PROVIDER_COLORS[row.provider] || PROVIDER_COLORS.other}"></span></span><span class="bar-row-meta">${PROVIDER_NAMES[row.provider] || row.providerName} · ${plural(row.generations30d, "generation")}${row.averageCostUSD !== null ? ` · ${unitMoney(row.averageCostUSD)} avg` : ""}</span></button>`.value).join("") : emptyState({ iconName: "ai", title: "No priced generations in the last 30 days", compact: true }));
}

// ---------- Revenue tab ----------
function renderRevenue() {
  const finance = state.finance;
  if (!finance) {
    patch(slot(root, "rev-legend"), "");
    patch(slot(root, "rev-note"), "Revenue and cost history come from the provider monitor, which is unavailable.");
    patch(slot(root, "month"), emptyState({ iconName: "finance", title: "Unavailable", compact: true }));
    patch(slot(root, "recon"), html`<tr><td colspan="5">${emptyState({ iconName: "finance", title: "Unavailable", compact: true })}</td></tr>`);
    return;
  }
  const points = finance.series.monthly || [];
  const hasVerified = points.some((point) => point.verifiedUSD !== null);
  patch(slot(root, "rev-legend"), html`<span class="legend-item"><span class="legend-swatch" style="--c:${CHART_COLORS.lavender}"></span>AI cost (estimated)</span><span class="legend-item"><span class="legend-swatch is-line" style="--c:${CHART_COLORS.mint}"></span>Revenue (net)</span>${hasVerified ? html`<span class="legend-item"><span class="legend-swatch is-dashed" style="--c:${CHART_COLORS.blue}"></span>Billed (verified)</span>` : ""}`);
  const datasets = [
    { type: "bar", label: "AI cost (estimated)", data: points.map((point) => Number(point.totalUSD) || 0), backgroundColor: "rgba(180, 151, 252, 0.72)", hoverBackgroundColor: CHART_COLORS.lavender, borderRadius: 4, maxBarThickness: 40, order: 2 },
    { type: "line", label: "Revenue (net)", data: points.map((point) => point.revenueUSD), borderColor: CHART_COLORS.mint, backgroundColor: CHART_COLORS.mint, borderWidth: 2, pointRadius: 3, tension: 0.25, spanGaps: false, order: 1 }
  ];
  if (hasVerified) {
    datasets.push({ type: "line", label: "Billed (verified)", data: points.map((point) => point.verifiedUSD), borderColor: CHART_COLORS.blue, backgroundColor: CHART_COLORS.blue, borderDash: [5, 4], borderWidth: 2, pointRadius: 3, spanGaps: false, order: 0 });
  }
  upsertChart("finance-revenue", slot(root, "rev-chart"), () => ({
    type: "bar",
    data: { labels: points.map((point) => `${monthLabel(point.label).replace(/ \d{4}$/, "")}${point.partial ? "*" : ""}`), datasets },
    options: baseOptions({ yFormat: axisMoney, tooltipLabel: (context) => ` ${context.dataset.label}: ${context.parsed.y === null ? "—" : money(context.parsed.y, { cents: true })}` })
  }), JSON.stringify(points.map((point) => [point.label, point.totalUSD, point.revenueUSD, point.verifiedUSD])));
  const current = points.at(-1);
  patch(slot(root, "rev-note"), [
    current?.revenueBasis === "manual" ? "This month's revenue was entered from App Store Connect." : "Revenue is estimated from subscribers who used AI each month, so it is a lower bound.",
    "Verified billing covers only providers with billing access.",
    points.some((point) => point.partial) ? "* Month starts before the 183-day event window." : ""
  ].filter(Boolean).join(" "));
  const overview = finance.overview;
  const revenue = overview.revenue;
  patch(slot(root, "month-sub"), monthLabel(finance.periodKey));
  patch(slot(root, "month"), html`<div class="list compact-list">
    <div class="list-row"><span class="list-main"><strong>Net revenue</strong><span>${revenue.basis === "manual" ? "Manual · App Store Connect" : revenue.basis === "estimated" ? "Estimated · lower bound" : "No paying subscribers seen"}</span></span><span class="list-side"><strong>${revenue.monthUSD === null ? "—" : money(revenue.monthUSD, { cents: true })}</strong></span></div>
    <div class="list-row"><span class="list-main"><strong>AI spend so far</strong><span>Estimated</span></span><span class="list-side"><strong>${money(overview.estimatedSpend.monthToDateUSD, { cents: true })}</strong></span></div>
    <div class="list-row"><span class="list-main"><strong>Projected month-end cost</strong><span>7-day average × days left</span></span><span class="list-side"><strong>${money(overview.projectedMonthCostUSD, { cents: true })}</strong></span></div>
    <div class="list-row"><span class="list-main"><strong>Gross margin</strong><span>${overview.grossMarginPercent === null ? "Needs revenue" : `${percent(overview.grossMarginPercent)} of revenue`}</span></span><span class="list-side"><strong class="${overview.grossMarginUSD !== null && overview.grossMarginUSD < 0 ? "negative" : ""}">${overview.grossMarginUSD === null ? "—" : money(overview.grossMarginUSD, { cents: true })}</strong></span></div>
    <div class="list-row"><span class="list-main"><strong>Paying subscribers</strong><span>${revenue.testSubscribers ? `${number(revenue.testSubscribers)} test excluded` : "Active in AI this month"}</span></span><span class="list-side"><strong>${number(revenue.payingSubscribers)}</strong></span></div>
  </div>`);
  patch(slot(root, "recon"), finance.providers.map((card) => {
    const recon = card.reconciliation;
    const tone = !recon ? "muted" : Math.abs(recon.deltaPercent || 0) >= 25 ? "warn" : "ok";
    return html`<tr class="is-clickable" data-open-provider="${card.id}">
      <td><span class="bar-row-title">${providerDot(card.id)}<span>${card.name}</span></span></td>
      <td class="num">${money(card.estimatedSpend.monthToDateUSD, { cents: true })}</td>
      <td class="num">${card.verifiedSpend ? money(card.verifiedSpend.monthToDate, { cents: true }) : html`<span class="faint">Not connected</span>`}</td>
      <td class="num">${recon ? html`${money(recon.deltaUSD, { cents: true })} <span class="faint">(${recon.deltaPercent === null ? "—" : `${recon.deltaPercent > 0 ? "+" : ""}${recon.deltaPercent}%`})</span>` : "—"}</td>
      <td>${recon ? toneBadge(tone, tone === "warn" ? "Gap ≥ 25%" : "Within 25%") : toneBadge("muted", card.capabilities.spend.supported ? "Credentials needed" : "No spend API")}</td>
    </tr>`.value;
  }).join(""));
}

// ---------- Plans tab ----------
function renderPlans() {
  const finance = state.finance;
  if (!finance) {
    patch(slot(root, "plans"), html`<tr><td colspan="7">${emptyState({ iconName: "subscribers", title: "Plan profitability unavailable", body: "It needs the provider monitor.", compact: true })}</td></tr>`);
    patch(slot(root, "plans-note"), "");
    patch(slot(root, "recs"), "");
    patch(slot(root, "notes"), "");
    return;
  }
  const profitability = finance.profitability;
  patch(slot(root, "plans"), profitability.rows.map((row) => html`<tr>
    <td><div class="cell-main"><strong>${row.label}</strong><span class="cell-sub">${row.priceUSD === null ? "Price not set" : `${money(row.priceUSD, { cents: true })} list`}</span></div></td>
    <td class="num">${row.netMonthlyUSD === null ? "—" : money(row.netMonthlyUSD, { cents: true })}</td>
    <td class="num"><a href="${buildHash("subscribers", { plan: row.label })}">${number(row.payingSubscribers)}</a>${row.testSubscribers ? html` <span class="faint">+${number(row.testSubscribers)} test</span>` : ""}</td>
    <td class="num">${row.revenueUSD === null ? "—" : money(row.revenueUSD, { cents: true })}</td>
    <td class="num">${money(row.costUSD, { cents: true })}${row.testCostUSD ? html` <span class="faint">+${money(row.testCostUSD, { cents: true })} test</span>` : ""}</td>
    <td class="num${row.marginUSD !== null && row.marginUSD < 0 ? " negative" : ""}">${row.marginUSD === null ? "—" : money(row.marginUSD, { cents: true })}</td>
    <td class="num">${money(row.worstCaseCostUSD, { cents: true })} ${row.worstCaseMarginUSD === null ? "" : toneBadge(row.worstCaseMarginUSD < 0 ? "crit" : "ok", `${row.worstCaseMarginUSD < 0 ? "loss" : "profit"} ${money(Math.abs(row.worstCaseMarginUSD), { cents: true })}`)}</td>
  </tr>`.value).join(""));
  patch(slot(root, "plans-note"), `${profitability.basis} Full-allowance cost assumes ${money(profitability.typicalVideoCostUSD, { cents: true })} per video clip and ${money(profitability.typicalPreviewCostUSD, { cents: true })} per music-video preview, plus every AI credit spent.`);
  const recommendations = finance.recommendations || [];
  patch(slot(root, "recs"), recommendations.length ? recommendations.map((item) => html`<article class="recommendation"><span class="list-icon" data-tone="lavender">${icon("ai")}</span><div><strong>${item.title}</strong><p>${item.detail}</p></div></article>`.value).join("") : emptyState({ iconName: "ok", title: "No recommendations right now", compact: true }));
  const quality = finance.dataQuality;
  const notes = [...quality.notes];
  if (quality.uncataloguedModels.length) notes.push(`Models seen in events but missing from the catalogue: ${quality.uncataloguedModels.join(", ")}.`);
  notes.push("BytePlus balances come from QueryBalanceAcct, which reports the prepaid balance; Google and OpenAI do not offer balance APIs.");
  patch(slot(root, "notes"), notes.map((note) => html`<li>${note}</li>`.value).join(""));
}

// ---------- Cost detail tab (dashboard callable) ----------
function daysRemainingInMonth() {
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(0, daysInMonth - now.getUTCDate());
}

function renderDetail() {
  const dashboard = state.dashboard;
  if (!dashboard) return;
  const stats = dashboard.stats;
  const windowDays = dashboard.eventWindowDays || 14;
  const periodCost = Number(stats.providerCostUSD) || 0;
  const windowCost = Number(stats.windowProviderCostUSD) || 0;
  const burn = windowDays > 0 ? windowCost / windowDays : 0;
  const remaining = daysRemainingInMonth();
  patch(slot(root, "detail-strip"), html`
    <div class="metric"><span class="metric-label">Spend this period</span><span class="metric-value num">${money(periodCost, { cents: true })}</span><span class="metric-sub">${monthLabel(dashboard.periodKey)} · per-user usage records</span></div>
    <div class="metric"><span class="metric-label">Spend last ${windowDays} days</span><span class="metric-value num">${money(windowCost, { cents: true })}</span><span class="metric-sub">${number(stats.creditsUsed)} credits this period</span></div>
    <div class="metric"><span class="metric-label">Burn rate</span><span class="metric-value num">${money(burn, { cents: true })}</span><span class="metric-sub">per day · ${windowDays}-day average</span></div>
    <div class="metric"><span class="metric-label">Projected month-end</span><span class="metric-value num">${money(periodCost + burn * remaining, { cents: true })}</span><span class="metric-sub">${plural(remaining, "day")} left at the current burn</span></div>`);
  const rows = dashboard.usageByDay || [];
  patch(slot(root, "cost-sub"), `Last ${windowDays} days · delivered generations`);
  upsertChart("finance-cost", slot(root, "cost-chart"), () => ({
    type: "bar",
    data: { labels: rows.map((row) => formatDay(`${row.day}T00:00:00Z`)), datasets: [{ label: "Provider cost", data: rows.map((row) => Number(row.providerCostUSD) || 0), backgroundColor: "rgba(122, 232, 187, 0.75)", hoverBackgroundColor: CHART_COLORS.mint, borderRadius: 4, maxBarThickness: 22 }] },
    options: baseOptions({ yFormat: axisMoney, tooltipLabel: (context) => ` ${money(context.parsed.y, { cents: true })}`, onClick: (event, elements) => { if (elements[0]) openDrawerRoute("day", rows[elements[0].index].day); } })
  }), JSON.stringify(rows));
  const peak = rows.reduce((max, row) => Math.max(max, Number(row.providerCostUSD) || 0), 0);
  const requests = rows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0);
  patch(slot(root, "cost-summary"), html`<span><strong>${money(windowCost, { cents: true })}</strong>total</span><span><strong>${money(peak, { cents: true })}</strong>peak day</span><span><strong>${number(requests)}</strong>requests</span>`);

  const activeUsers = Math.max(1, stats.activeUsers || 0);
  const windowRequests = Number(stats.windowRequests) || 0;
  const creditsUsed = Number(stats.creditsUsed) || 0;
  const unit = [
    ["Cost per request", windowRequests > 0 ? unitMoney(windowCost / windowRequests) : "—", `Last ${windowDays} days`],
    ["Cost per active user", money(periodCost / activeUsers, { cents: true }), "This period"],
    ["Cost per 1,000 credits", creditsUsed > 0 ? money((periodCost / creditsUsed) * 1000, { cents: true }) : "—", "This period"],
    ["Video share of requests", windowRequests > 0 ? `${Math.round(((Number(stats.windowVideos) || 0) / windowRequests) * 100)}%` : "—", `Last ${windowDays} days`],
    ["Requests per day", number(Math.round(windowRequests / windowDays)), `${windowDays}-day average`]
  ];
  patch(slot(root, "unit"), unit.map(([label, value, meta]) => html`<div class="list-row"><span class="list-main"><strong>${label}</strong><span>${meta}</span></span><span class="list-side"><strong>${value}</strong></span></div>`.value).join(""));

  const costRows = dashboard.costByModel || [];
  const byProvider = new Map();
  costRows.forEach((row) => {
    const entry = byProvider.get(row.provider) || { provider: row.provider, requests: 0, cost: 0 };
    entry.requests += Number(row.requests) || 0;
    entry.cost += Number(row.providerCostUSD) || 0;
    byProvider.set(row.provider, entry);
  });
  const providerRows = Array.from(byProvider.values()).sort((lhs, rhs) => rhs.cost - lhs.cost);
  patch(slot(root, "by-provider"), providerRows.length ? providerRows.map((entry) => html`<tr><td><strong>${entry.provider || "unknown"}</strong></td><td class="num">${number(entry.requests)}</td><td class="num">${money(entry.cost, { cents: true })}</td><td class="num">${entry.requests ? unitMoney(entry.cost / entry.requests) : "—"}</td></tr>`.value).join("") : html`<tr><td colspan="4">${emptyState({ iconName: "finance", title: "No provider spend in this window", compact: true })}</td></tr>`);
  patch(slot(root, "by-model"), costRows.length ? costRows.map((row) => html`<tr class="is-clickable" data-model-events="${row.model}"><td><div class="cell-main"><strong>${row.model || "unknown"}</strong><span class="cell-sub">${row.provider}</span></div></td><td class="num">${number(row.requests)}</td><td class="num">${number(row.credits)}</td><td class="num">${money(row.providerCostUSD, { cents: true })}</td><td class="num">${row.requests ? unitMoney(row.providerCostUSD / row.requests) : "—"}</td></tr>`.value).join("") : html`<tr><td colspan="5">${emptyState({ iconName: "ai", title: "No model spend in this window", compact: true })}</td></tr>`);

  const leak = dashboard.undeliveredVideo;
  patch(slot(root, "leak-sub"), `Last ${leak?.windowDays || windowDays} days · started, billed, never delivered`);
  patch(slot(root, "leak"), !leak
    ? emptyState({ iconName: "info", title: "No data yet", body: "Deploy the functions build that reports undeliveredVideo.", compact: true })
    : html`<div class="mini-stats" style="--cols:2"><div><span>Estimated waste</span><strong>${money(leak.estimatedCostUSD, { cents: true })}</strong></div><div><span>Jobs</span><strong>${number(leak.jobs)}</strong></div></div>
      ${leak.byReason.length ? html`<table class="data-table compact"><thead><tr><th>Reason</th><th class="num">Jobs</th><th class="num">Est. cost</th></tr></thead><tbody>${leak.byReason.map((row) => html`<tr><td>${row.reason || "unknown"}</td><td class="num">${number(row.jobs)}</td><td class="num">${money(row.estimatedCostUSD, { cents: true })}</td></tr>`)}</tbody></table>` : html`<p class="panel-note" style="margin-top:12px">No undelivered video spend in this window.</p>`}`);

  const withCost = users().filter((user) => (Number(user.providerCostUSD) || 0) > 0).sort((lhs, rhs) => rhs.providerCostUSD - lhs.providerCostUSD);
  patch(slot(root, "users-sub"), `${monthLabel(dashboard.periodKey)} · ${plural(withCost.length, "user")} with spend`);
  patch(slot(root, "cost-users"), withCost.length ? withCost.slice(0, 40).map((user) => {
    const credits = Number(user.creditsUsed) || 0;
    return html`<tr class="is-clickable" data-open-user="${user.quotaSubjectHash}"><td><div class="cell-main"><strong>${accountLabel(user)}</strong><span class="cell-sub mono">${shortID(user.uid, 6)}</span></div></td><td>${planLabel(user.subscriptionProductID)}</td><td class="num">${number(credits)}</td><td class="num">${money(user.providerCostUSD, { cents: true })}</td><td class="num">${credits > 0 ? unitMoney(user.providerCostUSD / credits) : "—"}</td></tr>`.value;
  }).join("") : html`<tr><td colspan="5">${emptyState({ iconName: "users", title: "No user spend recorded this period", compact: true })}</td></tr>`);
}

function exportCostCSV() {
  const rows = users().filter((user) => (Number(user.providerCostUSD) || 0) > 0)
    .sort((lhs, rhs) => rhs.providerCostUSD - lhs.providerCostUSD)
    .map((user) => {
      const cost = Number(user.providerCostUSD) || 0;
      const credits = Number(user.creditsUsed) || 0;
      return [accountLabel(user), user.uid, planLabel(user.subscriptionProductID), credits, cost, credits > 0 ? (cost / credits).toFixed(6) : ""];
    });
  downloadCSV(`soundframe-cost-${state.dashboard?.periodKey || "current"}.csv`, ["account", "uid", "plan", "creditsUsed", "providerCostUSD", "costPerCredit"], rows);
}

export default {
  name: "finance",
  title: "Finance",
  configure(options) {
    actions = { ...actions, ...options };
  },
  mount(element) {
    root = element;
    patch(root, layout());
    root.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-tab]");
      if (tab) {
        savePrefs({ financeTab: tab.dataset.tab });
        setParams({ tab: tab.dataset.tab });
        return;
      }
      const gran = event.target.closest("[data-granularity]");
      if (gran) {
        granularity = gran.dataset.granularity;
        root.querySelectorAll("[data-granularity]").forEach((button) => button.setAttribute("aria-pressed", String(button === gran)));
        renderSpend();
        return;
      }
      if (event.target.closest("[data-finance-settings]")) openFinanceSettings();
      const record = event.target.closest("[data-record-balance]");
      if (record) openFinanceSettings({ focusManual: record.dataset.recordBalance });
      if (event.target.closest("[data-finance-sync]")) actions.sync(event.target.closest("[data-finance-sync]"));
      if (event.target.closest("[data-retry-finance]")) actions.reloadFinance?.();
      if (event.target.closest("[data-export-cost]")) exportCostCSV();
      const model = event.target.closest("[data-open-model]");
      if (model) openDrawerRoute("model", model.dataset.openModel);
      const provider = event.target.closest("[data-open-provider]");
      if (provider) openDrawerRoute("provider", provider.dataset.openProvider);
      const user = event.target.closest("[data-open-user]");
      if (user) openDrawerRoute("user", user.dataset.openUser);
      const modelEvents = event.target.closest("[data-model-events]");
      if (modelEvents) location.hash = buildHash("events", { model: modelEvents.dataset.modelEvents });
    });
    slot(root, "tabs").addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      const ids = TABS.map((tab) => tab.id);
      const index = ids.indexOf(activeTab());
      const next = event.key === "Home" ? 0 : event.key === "End" ? ids.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
      event.preventDefault();
      savePrefs({ financeTab: ids[next] });
      setParams({ tab: ids[next] });
      requestAnimationFrame(() => root.querySelector(`[data-tab="${ids[next]}"]`)?.focus());
    });
  },
  update() {
    renderHeader();
    renderAlerts();
    renderStrip();
    const tab = renderTabs();
    if (tab === "spend") renderSpend();
    if (tab === "revenue") renderRevenue();
    if (tab === "plans") renderPlans();
    if (tab === "detail") renderDetail();
  }
};

export { findUser, idChip, meter, resolveRange };
