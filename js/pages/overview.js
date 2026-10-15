// Overview: is SoundFrame healthy, is it making money, what needs attention.
import { state, prefs, savePrefs } from "../store.js";
import {
  html, money, number, percent, plural, formatDay, monthLabel, planLabel, accountLabel, PROVIDER_IDS, PROVIDER_COLORS,
  PROVIDER_FULL_NAMES, PROVIDER_NAMES, PLAN_ORDER, timeAgo
} from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, provenance, deltaBadge, meter, skeletonStrip, skeletonPanel, syncSegmented, animateRows } from "../ui.js";
import {
  resolveRange, rangeSummary, deltaInfo, buildNotifications, overallHealth, outcomeTotals, failingModels, usersAtRisk, models,
  providerCards, events, planCounts, modelKey, isPending
} from "../data.js";
import { statusPill, providerDot, successMarkup, eventRow, toneBadge, usageMeter } from "../views.js";
import { upsertChart, baseOptions, axisMoney, CHART_COLORS } from "../charts.js";
import { openDrawerRoute, buildHash } from "../router.js";

let root;
let chartMetric = "spend";

function metricCell({ key, label, href, primary = false, tip = "" }) {
  return html`<a class="metric${primary ? " is-primary" : ""}" href="${href}" data-metric="${key}"${tip ? html` data-tip="${tip}"` : ""}>
    <span class="metric-label"><span>${label}</span><span data-slot="${key}-prov"></span></span>
    <span class="metric-value num" data-slot="${key}-value">—</span>
    <span class="metric-sub" data-slot="${key}-sub"></span>
  </a>`;
}

function layout() {
  return html`
    ${pageHeader({ id: "overview", title: "Overview" })}
    <div class="exec" data-slot="exec">
      <div class="exec-row exec-primary">
        ${metricCell({ key: "subs", label: "Paying subscribers", href: "#subscribers", primary: true, tip: "Subscribers active in SoundFrame AI this month (a lower bound)" })}
        ${metricCell({ key: "revenue", label: "Net revenue · month", href: "#finance?tab=revenue", primary: true })}
        ${metricCell({ key: "spend", label: "AI spend", href: "#finance?tab=spend", primary: true })}
        ${metricCell({ key: "margin", label: "Gross margin · month", href: "#finance?tab=revenue", primary: true, tip: "Revenue minus projected month-end AI cost" })}
      </div>
      <div class="exec-row exec-secondary">
        ${metricCell({ key: "active", label: "Active users · month", href: "#users" })}
        ${metricCell({ key: "gens", label: "Generations", href: "#events" })}
        ${metricCell({ key: "success", label: "Job success · 30d", href: "#operations" })}
        ${metricCell({ key: "alerts", label: "Critical alerts", href: "#providers" })}
      </div>
    </div>
    <div class="grid">
      <section class="panel span-8 hero-chart">
        <header class="panel-head">
          <div class="panel-title"><h2 data-slot="chart-title">AI spend</h2><p data-slot="chart-sub"></p></div>
          <div class="panel-tools">
            <div class="segmented" role="group" aria-label="Chart metric" data-slot="chart-metric">
              <button type="button" data-chart-metric="spend" aria-pressed="true">Spend</button>
              <button type="button" data-chart-metric="gens" aria-pressed="false">Generations</button>
            </div>
          </div>
        </header>
        <div class="panel-body">
          <div class="legend" data-slot="chart-legend"></div>
          <div class="chart-frame" style="--chart-h:300px"><canvas data-slot="chart" role="img" aria-label="Daily AI spend by provider for the selected range"></canvas></div>
          <div class="chart-summary" data-slot="chart-summary"></div>
          <div data-slot="chart-note"></div>
        </div>
      </section>
      <section class="panel span-4 attention">
        <header class="panel-head"><div class="panel-title"><h2>Needs attention</h2><p data-slot="attention-sub">Alerts that need action</p></div></header>
        <div class="list" data-slot="attention"></div>
        <footer class="panel-foot"><span data-slot="attention-foot"></span><button class="link-btn" type="button" data-open-notifications>All notifications ${icon("arrow-right")}</button></footer>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Spend by provider</h2><p data-slot="providers-sub"></p></div><a class="link-btn" href="#providers">Health ${icon("arrow-right")}</a></header>
        <div class="bar-list" data-slot="providers"></div>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Model usage</h2><p>Top models by spend · last 30 days</p></div><a class="link-btn" href="#operations">Operations ${icon("arrow-right")}</a></header>
        <div class="bar-list" data-slot="models"></div>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Plan mix</h2><p data-slot="plans-sub">Firebase-visible subscribers this month</p></div><a class="link-btn" href="#subscribers">Subscribers ${icon("arrow-right")}</a></header>
        <div class="panel-body" data-slot="plans"></div>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Users at risk</h2><p>At or near their monthly limit</p></div><a class="link-btn" href="#users?status=risk">Users ${icon("arrow-right")}</a></header>
        <div class="list" data-slot="risk"></div>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Job health</h2><p>Async generation jobs · last 30 days</p></div><a class="link-btn" href="#operations">Details ${icon("arrow-right")}</a></header>
        <div class="panel-body" data-slot="jobs"></div>
      </section>
      <section class="panel span-4">
        <header class="panel-head"><div class="panel-title"><h2>Recent activity</h2><p>Newest generations</p></div><a class="link-btn" href="#events">Events ${icon("arrow-right")}</a></header>
        <div class="list" data-slot="activity"></div>
      </section>
    </div>`;
}

function setMetric(key, { value, format, unavailable, prov = "", sub = "", tone = "" }) {
  const cell = root.querySelector(`[data-metric="${key}"]`);
  if (tone) cell.dataset.tone = tone;
  else delete cell.dataset.tone;
  setValue(slot(root, `${key}-value`), `overview.${key}`, value, format, { pending: isPending(), unavailable });
  patch(slot(root, `${key}-prov`), prov);
  patch(slot(root, `${key}-sub`), sub);
}

function renderHeader(notifications) {
  const health = overallHealth(notifications);
  const range = resolveRange();
  patch(slot(root, "meta"), html`${statusPill(health.tone, health.label)}<span>${health.detail}</span><span class="faint">·</span><span class="meta-extra">${range.label} · ${range.short}</span><span class="faint">·</span><span class="meta-extra">Billing period ${monthLabel(state.dashboard?.periodKey || state.finance?.periodKey)}</span>`);
}

function renderExec(notifications) {
  const finance = state.finance;
  const dashboard = state.dashboard;
  const summary = rangeSummary();
  const compare = prefs.compare;
  const range = resolveRange();

  const revenue = finance?.overview?.revenue;
  setMetric("subs", {
    value: revenue ? revenue.payingSubscribers : null,
    format: number,
    unavailable: "Unavailable",
    prov: revenue ? provenance("estimated", "Lower bound", "Only subscribers who used AI this month are visible") : provenance("unavailable", "No source"),
    sub: revenue ? html`${revenue.testSubscribers ? `+${number(revenue.testSubscribers)} test excluded · ` : ""}App Store totals not connected` : "Provider monitor unavailable"
  });

  const monthly = finance?.series?.monthly || [];
  const previousRevenue = monthly.length > 1 ? monthly[monthly.length - 2].revenueUSD : null;
  setMetric("revenue", {
    value: revenue ? revenue.monthUSD : null,
    format: (value) => money(value, { cents: true }),
    unavailable: revenue && revenue.basis === "none" ? "No revenue yet" : "Unavailable",
    prov: !revenue ? provenance("unavailable", "No source") : revenue.basis === "manual" ? provenance("manual", "Manual", "Net proceeds entered from App Store Connect") : provenance("estimated", "Estimated", "Active AI subscribers × net plan price"),
    sub: revenue ? html`${compare && previousRevenue !== null ? html`${deltaBadge(deltaInfo(revenue.monthUSD || 0, previousRevenue))} vs last month · ` : ""}net of ${Math.round((finance.settings?.revenue?.appleCommissionRate ?? 0.3) * 100)}% Apple commission` : ""
  });

  if (summary) {
    const delta = summary.previousSummary ? deltaInfo(summary.summary.spend, summary.previousSummary.spend) : null;
    const verified = finance.overview.verifiedSpendMonthToDateUSD;
    setMetric("spend", {
      value: summary.summary.spend,
      format: (value) => money(value, { cents: true }),
      prov: provenance("estimated", "Estimated", "SoundFrame's per-generation list-price records"),
      sub: html`${compare && delta ? html`${deltaBadge(delta, { goodWhenUp: false })} vs prior · ` : ""}${money(summary.summary.average, { cents: true })}/day${verified !== null ? html` · ${money(verified, { cents: true })} billed MTD` : ""}`
    });
  } else {
    setMetric("spend", { value: null, format: money, unavailable: "Unavailable", prov: provenance("unavailable", "No source"), sub: dashboard ? html`${money(dashboard.stats.windowProviderCostUSD, { cents: true })} in the 14-day event window` : "" });
  }

  const overview = finance?.overview;
  setMetric("margin", {
    value: overview ? overview.grossMarginUSD : null,
    format: (value) => money(value, { cents: true }),
    unavailable: overview ? "Needs revenue" : "Unavailable",
    tone: overview?.grossMarginUSD !== null && overview?.grossMarginUSD < 0 ? "crit" : overview?.grossMarginPercent !== null && overview?.grossMarginPercent < 30 ? "warn" : "",
    prov: overview ? provenance("estimated", "Projected") : provenance("unavailable", "No source"),
    sub: overview ? html`${overview.grossMarginPercent === null ? "—" : percent(overview.grossMarginPercent)} of revenue · ${money(overview.projectedMonthCostUSD, { cents: true })} projected cost` : ""
  });

  setMetric("active", {
    value: dashboard ? dashboard.stats.activeUsers : null,
    format: number,
    sub: dashboard ? `${number(dashboard.stats.creditsUsed)} credits · ${plural(dashboard.stats.videoClipsUsed, "video clip")} used` : ""
  });

  if (summary) {
    const delta = summary.previousSummary ? deltaInfo(summary.summary.generations, summary.previousSummary.generations) : null;
    setMetric("gens", {
      value: summary.summary.generations,
      format: number,
      sub: html`${compare && delta ? html`${deltaBadge(delta)} vs prior · ` : ""}${range.label.toLowerCase()} · delivered`
    });
  } else {
    setMetric("gens", { value: dashboard ? dashboard.stats.windowRequests : null, format: number, sub: "last 14 days · event window" });
  }

  const totals = finance ? outcomeTotals() : null;
  setMetric("success", {
    value: totals?.successRate ?? null,
    format: (value) => `${value.toFixed(1)}%`,
    unavailable: finance ? "No jobs" : "Unavailable",
    tone: totals?.successRate !== null && totals?.successRate !== undefined ? (totals.successRate < 80 ? "crit" : totals.successRate < 95 ? "warn" : "") : "",
    sub: totals ? `${number(totals.failed)} failed · ${number(totals.pending)} in flight` : ""
  });

  const critical = notifications.filter((item) => item.severity === "critical").length;
  const warnings = notifications.filter((item) => item.severity === "warning").length;
  setMetric("alerts", {
    value: critical,
    format: number,
    tone: critical > 0 ? "crit" : "",
    sub: `${plural(warnings, "warning")} · ${plural(notifications.filter((item) => item.severity === "info").length, "note")}`
  });
}

function renderChart() {
  const summary = rangeSummary();
  const canvas = slot(root, "chart");
  const compare = prefs.compare;
  syncSegmented(slot(root, "chart-metric"));
  if (!summary) {
    // Fallback: the dashboard's own 14-day window (delivered events only).
    const rows = state.dashboard?.usageByDay || [];
    patch(slot(root, "chart-title"), chartMetric === "spend" ? "AI spend" : "Generations");
    patch(slot(root, "chart-sub"), "Last 14 days · event window (provider monitor unavailable)");
    patch(slot(root, "chart-legend"), "");
    patch(slot(root, "chart-note"), html`<p class="panel-note">The date range and comparison need the provider monitor's 90-day history.</p>`);
    patch(slot(root, "chart-summary"), rows.length ? html`<span><strong>${money(rows.reduce((sum, row) => sum + row.providerCostUSD, 0), { cents: true })}</strong>spend</span><span><strong>${number(rows.reduce((sum, row) => sum + row.requests, 0))}</strong>requests</span>` : "");
    upsertChart("overview-main", canvas, () => ({
      type: "bar",
      data: {
        labels: rows.map((row) => formatDay(`${row.day}T00:00:00Z`)),
        datasets: [{ label: chartMetric === "spend" ? "Spend" : "Requests", data: rows.map((row) => chartMetric === "spend" ? row.providerCostUSD : row.requests), backgroundColor: CHART_COLORS.mint, borderRadius: 4, maxBarThickness: 18 }]
      },
      options: baseOptions({
        yFormat: chartMetric === "spend" ? axisMoney : (value) => number(value),
        onClick: (event, elements) => { if (elements[0]) openDrawerRoute("day", rows[elements[0].index].day); }
      })
    }), JSON.stringify([chartMetric, rows]));
    return;
  }
  const { points, previousPoints, summary: totals, previousSummary, range, partial } = summary;
  const usedProviders = PROVIDER_IDS.filter((id) => points.some((point) => (point.byProvider?.[id] || 0) > 0));
  const spendMode = chartMetric === "spend";
  patch(slot(root, "chart-title"), spendMode ? "AI spend by provider" : "Generations");
  patch(slot(root, "chart-sub"), `${range.short} · ${spendMode ? "estimated from per-generation list prices" : "delivered generations"}${compare ? ` · vs ${summary.previous.short}` : ""}`);
  patch(slot(root, "chart-legend"), html`${spendMode ? usedProviders.map((id) => html`<span class="legend-item"><span class="legend-swatch" style="--c:${PROVIDER_COLORS[id]}"></span>${PROVIDER_NAMES[id]} <strong>${money(totals.byProvider[id], { cents: true })}</strong></span>`) : html`<span class="legend-item"><span class="legend-swatch" style="--c:${CHART_COLORS.mint}"></span>Generations <strong>${number(totals.generations)}</strong></span>`}${compare ? html`<span class="legend-item"><span class="legend-swatch is-dashed" style="--c:${CHART_COLORS.compare}"></span>Previous period</span>` : ""}`);

  const previousValues = points.map((_, index) => {
    const point = previousPoints[index];
    if (!point) return null;
    return spendMode ? Number(point.totalUSD) || 0 : Number(point.generations) || 0;
  });
  const datasets = spendMode
    ? (usedProviders.length ? usedProviders : ["byteplus"]).map((id) => ({
      type: "bar", label: PROVIDER_NAMES[id], data: points.map((point) => point.byProvider?.[id] || 0), backgroundColor: PROVIDER_COLORS[id],
      hoverBackgroundColor: PROVIDER_COLORS[id], borderRadius: 3, borderSkipped: false, maxBarThickness: 22, stack: "spend", order: 2
    }))
    : [{ type: "bar", label: "Generations", data: points.map((point) => point.generations), backgroundColor: CHART_COLORS.mint, borderRadius: 3, maxBarThickness: 22, order: 2 }];
  if (compare) {
    datasets.push({
      type: "line", label: "Previous period", data: previousValues, borderColor: CHART_COLORS.compare, borderDash: [5, 4], borderWidth: 1.5,
      pointRadius: 0, pointHoverRadius: 3, tension: 0.25, spanGaps: true, order: 1, stack: "compare"
    });
  }
  upsertChart("overview-main", canvas, () => ({
    type: "bar",
    data: { labels: points.map((point) => formatDay(point.date)), datasets },
    options: baseOptions({
      stacked: spendMode,
      yFormat: spendMode ? axisMoney : (value) => number(value),
      onClick: (event, elements) => { if (elements[0]) openDrawerRoute("day", points[elements[0].index].key); },
      tooltipLabel: (context) => ` ${context.dataset.label}: ${context.parsed.y === null ? "—" : spendMode ? money(context.parsed.y, { cents: true }) : number(context.parsed.y)}`,
      tooltipFooter: (items) => {
        const point = points[items[0]?.dataIndex];
        if (!point) return "";
        return spendMode ? `Total ${money(point.totalUSD, { cents: true })} · ${number(point.generations)} generations · click for detail` : "Click for the day's breakdown";
      }
    })
  }), JSON.stringify([chartMetric, compare, points.map((point) => [point.key, point.totalUSD, point.generations]), previousValues]));

  const peak = totals.peak;
  const delta = previousSummary ? deltaInfo(spendMode ? totals.spend : totals.generations, spendMode ? previousSummary.spend : previousSummary.generations) : null;
  patch(slot(root, "chart-summary"), html`
    <span><strong>${spendMode ? money(totals.spend, { cents: true }) : number(totals.generations)}</strong>total</span>
    <span><strong>${spendMode ? money(totals.average, { cents: true }) : number(totals.days ? totals.generations / totals.days : 0)}</strong>per day</span>
    <span><strong>${peak ? (spendMode ? money(peak.totalUSD, { cents: true }) : number(peak.generations)) : "—"}</strong>peak${peak ? ` · ${formatDay(peak.date)}` : ""}</span>
    ${compare ? html`<span><strong>${previousSummary ? (spendMode ? money(previousSummary.spend, { cents: true }) : number(previousSummary.generations)) : "—"}</strong>previous period ${delta ? deltaBadge(delta, { goodWhenUp: !spendMode }) : ""}</span>` : ""}`);
  patch(slot(root, "chart-note"), partial ? html`<p class="panel-note">Spend history starts ${formatDay(summary.earliest)}; earlier days in this range are not available.</p>` : compare && !previousSummary ? html`<p class="panel-note">The previous period starts before the 90-day spend history, so it is not compared.</p>` : "");
}

function renderAttention(notifications) {
  const urgent = notifications.filter((item) => item.severity !== "info");
  patch(slot(root, "attention-sub"), urgent.length ? `${plural(urgent.length, "item")} need action` : "Nothing needs action");
  patch(slot(root, "attention-foot"), `${plural(notifications.filter((item) => item.severity === "info").length, "note")}`);
  if (!state.dashboard && !state.finance) {
    patch(slot(root, "attention"), "");
    return;
  }
  if (urgent.length === 0) {
    patch(slot(root, "attention"), emptyState({ iconName: "ok", title: "All clear", body: "No low balances, runway, spend spikes, sync failures, error spikes or users over limit.", compact: true }));
    return;
  }
  patch(slot(root, "attention"), urgent.slice(0, 6).map((item) => {
    const tone = item.severity === "critical" ? "crit" : "warn";
    return html`<a class="list-row" href="${item.route || "#overview"}"><span class="list-icon" data-tone="${tone}">${icon(item.severity === "critical" ? "critical" : "alert")}</span><span class="list-main wrap"><strong>${item.title}</strong><span>${item.detail}</span></span>${icon("chevron-right")}</a>`.value;
  }).join(""));
}

function renderProviders() {
  const summary = rangeSummary();
  const cards = providerCards();
  if (!summary) {
    patch(slot(root, "providers-sub"), "Last 14 days · event window");
    const rows = state.dashboard?.costByModel || [];
    const byProvider = new Map();
    rows.forEach((row) => byProvider.set(row.provider, (byProvider.get(row.provider) || 0) + row.providerCostUSD));
    const entries = Array.from(byProvider.entries()).sort((lhs, rhs) => rhs[1] - lhs[1]);
    const max = Math.max(...entries.map((entry) => entry[1]), 0.0001);
    patch(slot(root, "providers"), entries.length ? entries.map(([name, value]) => html`<div class="bar-row"><span class="bar-row-title"><span>${name}</span></span><span class="bar-row-value">${money(value, { cents: true })}</span>${meter((value / max) * 100)}</div>`) : emptyState({ iconName: "finance", title: "No provider spend yet", compact: true }));
    return;
  }
  patch(slot(root, "providers-sub"), `${summary.range.label} · estimated`);
  const total = summary.summary.spend || 0;
  const ids = PROVIDER_IDS.filter((id) => id !== "other" || summary.summary.byProvider.other > 0);
  patch(slot(root, "providers"), ids.map((id) => {
    const value = summary.summary.byProvider[id] || 0;
    const card = cards.find((entry) => entry.id === id);
    const balance = card ? (card.balance.availableUSD === null ? "Balance unavailable" : `${money(card.balance.availableUSD, { cents: true })} ${card.balance.kind === "verified" ? "verified" : card.balance.kind === "manual_estimate" ? "est." : card.balance.kind}`) : "";
    const runway = card?.runway?.days !== null && card?.runway?.days !== undefined ? ` · ${card.runway.days < 10 ? card.runway.days.toFixed(1) : Math.round(card.runway.days)} days runway` : "";
    const tone = card?.status === "critical" ? "crit" : card?.status === "warning" ? "warn" : "";
    return html`<a class="bar-row" href="${id === "other" ? "#finance?tab=spend" : buildHash("providers", { provider: id })}">
      <span class="bar-row-title">${providerDot(id)}<span>${PROVIDER_FULL_NAMES[id]}</span>${tone ? toneBadge(tone, tone === "crit" ? "Critical" : "Warning") : ""}</span>
      <span class="bar-row-value">${money(value, { cents: true })}</span>
      <span class="meter-track"><span class="meter-fill" style="--pct:${total > 0 ? (value / total) * 100 : 0}%;--fill:${PROVIDER_COLORS[id]}"></span></span>
      <span class="bar-row-meta">${total > 0 ? Math.round((value / total) * 100) : 0}% of spend${balance ? ` · ${balance}` : ""}${runway}</span>
    </a>`.value;
  }).join(""));
}

function renderModels() {
  if (!state.finance) {
    const rows = (state.dashboard?.costByModel || []).slice(0, 6);
    const max = Math.max(...rows.map((row) => row.providerCostUSD), 0.0001);
    patch(slot(root, "models"), rows.length ? rows.map((row) => html`<div class="bar-row"><span class="bar-row-title"><span>${row.model}</span></span><span class="bar-row-value">${money(row.providerCostUSD, { cents: true })}</span>${meter((row.providerCostUSD / max) * 100)}<span class="bar-row-meta">${row.provider} · ${plural(row.requests, "request")} · 14 days</span></div>`) : emptyState({ iconName: "ai", title: "No model usage yet", compact: true }));
    return;
  }
  const rows = models().filter((row) => row.spend30dUSD > 0 || row.generations30d > 0).slice(0, 6);
  const max = Math.max(...rows.map((row) => row.spend30dUSD), 0.0001);
  patch(slot(root, "models"), rows.length ? rows.map((row) => html`<button class="bar-row" type="button" data-open-model="${modelKey(row)}">
    <span class="bar-row-title">${providerDot(row.provider)}<span>${row.label}</span></span>
    <span class="bar-row-value">${money(row.spend30dUSD, { cents: true })}</span>
    <span class="meter-track"><span class="meter-fill" style="--pct:${(row.spend30dUSD / max) * 100}%;--fill:${PROVIDER_COLORS[row.provider] || PROVIDER_COLORS.other}"></span></span>
    <span class="bar-row-meta">${plural(row.generations30d, "generation")}${row.outcomes?.successRate !== null && row.outcomes?.successRate !== undefined ? ` · ${row.outcomes.successRate}% success` : ""}</span>
  </button>`.value).join("") : emptyState({ iconName: "ai", title: "No model usage in 30 days", compact: true }));
}

function renderPlans() {
  const dashboardCounts = planCounts();
  const rows = state.finance?.profitability?.rows || [];
  const labels = PLAN_ORDER.filter((label) => dashboardCounts.get(label) || rows.find((row) => row.label === label)?.payingSubscribers);
  const total = Array.from(dashboardCounts.values()).reduce((sum, value) => sum + value, 0);
  const colors = { Go: "#80aafe", "Pro monthly": "#7ae8bb", "Pro 3-month": "#b497fc", "Legacy annual": "#5e656e" };
  if (!state.dashboard) {
    patch(slot(root, "plans"), "");
    return;
  }
  if (total === 0) {
    patch(slot(root, "plans"), emptyState({ iconName: "subscribers", title: "No subscribers have used AI this month", body: "Subscribers appear here after their first AI request of the billing period.", compact: true }));
    return;
  }
  patch(slot(root, "plans-sub"), `${plural(total, "subscriber")} with AI activity · ${monthLabel(state.dashboard.periodKey)}`);
  patch(slot(root, "plans"), html`
    <div class="stack-bar plan-bar" role="img" aria-label="Plan mix">${labels.map((label) => html`<span style="--c:${colors[label] || "#5e656e"};flex-grow:${dashboardCounts.get(label) || 0}"></span>`)}</div>
    <div class="plan-rows">${labels.map((label) => {
      const count = dashboardCounts.get(label) || 0;
      const row = rows.find((entry) => entry.label === label);
      return html`<a class="plan-row" href="${buildHash("subscribers", { plan: label })}">
        <span class="legend-item"><span class="legend-swatch" style="--c:${colors[label] || "#5e656e"}"></span>${label}</span>
        <span class="num">${number(count)}</span>
        <span class="faint num">${row?.revenueUSD !== null && row?.revenueUSD !== undefined ? `${money(row.revenueUSD, { cents: true })}/mo` : "—"}</span>
      </a>`;
    })}</div>
    <p class="panel-note">Counts are Firebase usage records. Paid subscriptions without AI use this month are not visible.</p>
    ${featureUsage()}`);
}

function featureUsage() {
  const rows = state.dashboard?.users || [];
  const total = (key) => rows.reduce((sum, user) => sum + (Number(user[key]) || 0), 0);
  const entries = [
    ["Text", total("textUsed"), "#80aafe"],
    ["Images", total("imageUsed"), "#b497fc"],
    ["Video", total("videoUsed"), "#7ae8bb"],
    ["Captions", total("captionUsed"), "#5e656e"]
  ].filter((entry) => entry[1] > 0);
  if (!entries.length) return "";
  return html`<div class="feature-usage">
    <p class="eyebrow">Feature usage · this month</p>
    <div class="stack-bar" role="img" aria-label="Feature usage">${entries.map(([, value, color]) => html`<span style="--c:${color};flex-grow:${value}"></span>`)}</div>
    <div class="legend">${entries.map(([label, value, color]) => html`<span class="legend-item"><span class="legend-swatch" style="--c:${color}"></span>${label} <strong>${number(value)}</strong></span>`)}</div>
  </div>`;
}

function renderRisk() {
  if (!state.dashboard) {
    patch(slot(root, "risk"), "");
    return;
  }
  const atRisk = usersAtRisk().slice(0, 5);
  patch(slot(root, "risk"), atRisk.length ? atRisk.map(({ user, risk }) => {
    const credit = user.effectiveCreditLimit > 0 ? user.creditsUsed / user.effectiveCreditLimit : 0;
    const video = user.effectiveVideoLimit > 0 ? user.videoUsed / user.effectiveVideoLimit : 0;
    const worst = video >= credit ? ["Videos", user.videoUsed, user.effectiveVideoLimit] : ["Credits", user.creditsUsed, user.effectiveCreditLimit];
    return html`<button class="list-row" type="button" data-open-user="${user.quotaSubjectHash}">
      <span class="list-icon" data-tone="${risk === "over" ? "crit" : "warn"}">${icon(risk === "over" ? "critical" : "alert")}</span>
      <span class="list-main"><strong>${accountLabel(user)}</strong><span>${planLabel(user.subscriptionProductID)} · ${worst[0]} ${number(worst[1])}/${number(worst[2])}</span></span>
      <span class="list-side">${toneBadge(risk === "over" ? "crit" : "warn", risk === "over" ? "Over" : "Near")}</span>
    </button>`.value;
  }).join("") : emptyState({ iconName: "ok", title: "Everyone is within limits", compact: true }));
}

function renderJobs() {
  if (!state.finance) {
    const leak = state.dashboard?.undeliveredVideo;
    patch(slot(root, "jobs"), html`${emptyState({ iconName: "ai", title: "Job outcomes unavailable", body: "Outcomes come from the provider monitor, which did not load.", compact: true })}${leak ? html`<p class="panel-note">${plural(leak.jobs, "undelivered video job")} (${money(leak.estimatedCostUSD, { cents: true })}) in the last ${leak.windowDays} days.</p>` : ""}`);
    return;
  }
  const totals = outcomeTotals();
  const failing = failingModels().slice(0, 3);
  const leak = state.dashboard?.undeliveredVideo;
  patch(slot(root, "jobs"), html`
    <div class="mini-stats" style="--cols:3">
      <div><span>In flight</span><strong>${number(totals.pending)}</strong></div>
      <div><span>Failed</span><strong class="${totals.failed ? "negative" : ""}">${number(totals.failed)}</strong></div>
      <div><span>Undelivered</span><strong>${leak ? number(leak.jobs) : "—"}</strong>${leak ? html`<small>${money(leak.estimatedCostUSD, { cents: true })} · ${leak.windowDays}d</small>` : ""}</div>
    </div>
    ${failing.length ? html`<div class="job-failing">${failing.map((row) => html`<button class="job-row" type="button" data-open-model="${modelKey(row)}"><span>${row.label}</span>${successMarkup(row.outcomes, { compact: true })}</button>`)}</div>` : html`<p class="panel-note" style="margin-top:12px">${totals.successRate === null ? "No finished jobs in 30 days." : `No model below 90% success (${totals.successRate}% overall).`}</p>`}
  `);
}

function renderActivity() {
  if (!state.dashboard) {
    patch(slot(root, "activity"), "");
    return;
  }
  const latest = events().slice(0, 6);
  patch(slot(root, "activity"), latest.length ? latest.map((event) => eventRow(event).value).join("") : emptyState({ iconName: "events", title: "No generations yet", body: "Events appear as creators use AI features.", compact: true }));
}

function renderSkeleton() {
  patch(slot(root, "attention"), html`<div class="panel-body" style="display:grid;gap:10px">${Array.from({ length: 4 }, () => html`<span class="skeleton sk-row"></span>`)}</div>`);
  ["providers", "models", "risk", "activity"].forEach((name) => patch(slot(root, name), html`<div class="panel-body" style="display:grid;gap:10px">${Array.from({ length: 3 }, () => html`<span class="skeleton sk-row"></span>`)}</div>`));
  patch(slot(root, "plans"), html`<span class="skeleton sk-row"></span>`);
  patch(slot(root, "jobs"), html`<span class="skeleton sk-row"></span>`);
}

export default {
  name: "overview",
  mount(element) {
    root = element;
    patch(root, layout());
    root.addEventListener("click", (event) => {
      const metric = event.target.closest("[data-chart-metric]");
      if (metric) {
        chartMetric = metric.dataset.chartMetric;
        root.querySelectorAll("[data-chart-metric]").forEach((button) => button.setAttribute("aria-pressed", String(button === metric)));
        renderChart();
        return;
      }
      const model = event.target.closest("[data-open-model]");
      if (model) openDrawerRoute("model", model.dataset.openModel);
      const user = event.target.closest("[data-open-user]");
      if (user) openDrawerRoute("user", user.dataset.openUser);
      const eventRowButton = event.target.closest("[data-open-event]");
      if (eventRowButton) openDrawerRoute("event", eventRowButton.dataset.openEvent);
      if (event.target.closest("[data-open-notifications]")) document.getElementById("bellButton").click();
      if (event.target.closest('[data-metric="alerts"]') && buildNotifications().some((item) => item.severity === "critical")) {
        // Critical alerts drill into the provider/finance view they belong to (default link).
      }
    });
  },
  update() {
    if (!state.dashboard && !state.finance) {
      renderSkeleton();
      return;
    }
    const notifications = buildNotifications();
    renderHeader(notifications);
    renderExec(notifications);
    renderChart();
    renderAttention(notifications);
    renderProviders();
    renderModels();
    renderPlans();
    renderRisk();
    renderJobs();
    renderActivity();
  },
  title: "Overview"
};

export { savePrefs, skeletonStrip, skeletonPanel, animateRows, usageMeter, timeAgo };
