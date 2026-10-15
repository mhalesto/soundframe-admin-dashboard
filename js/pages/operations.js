// AI Operations: job outcomes, reliability per model, cost recorded vs list price, undelivered video.
// Data: finance monitor models (30-day outcomes from the async job collections) + dashboard undeliveredVideo.
import { state } from "../store.js";
import { html, money, unitMoney, number, plural, formatDateTime, timeAgo, kindLabel, PROVIDER_NAMES, PROVIDER_FULL_NAMES, shortID } from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, callout, animateRows } from "../ui.js";
import { models, outcomeTotals, failingModels, modelKey, users, isPending } from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch } from "../filters.js";
import { successMarkup, outcomeBar, modelCell, costCompare, toneBadge, providerDot } from "../views.js";
import { openDrawerRoute, buildHash } from "../router.js";
import { downloadCSV } from "../csv.js";
import { financeUnavailable } from "./finance.js";

let root;
let lastSignature = "";

function dims() {
  const rows = models();
  return [
    { key: "provider", label: "Provider", options: ["byteplus", "google", "openai", "other"].filter((id) => rows.some((row) => row.provider === id)).map((id) => ({ value: id, label: PROVIDER_FULL_NAMES[id] })) },
    { key: "kind", label: "Kind", options: Array.from(new Set(rows.map((row) => row.kind))).sort().map((kind) => ({ value: kind, label: kindLabel(kind) })) },
    { key: "status", label: "Status", options: [
      { value: "used", label: "Used in 30 days" },
      { value: "failing", label: "Below 90% success" },
      { value: "inflight", label: "Jobs in flight" },
      { value: "tracked", label: "Outcome-tracked" }
    ] },
    { key: "unpriced", label: "Data quality", options: [{ value: "1", label: "Has unpriced generations" }] }
  ];
}

function filteredModels() {
  const params = state.route.params;
  const provider = params.get("provider");
  const kind = params.get("kind");
  const status = params.get("status");
  const unpriced = params.get("unpriced");
  const query = params.get("q") || "";
  const failing = new Set(failingModels().map(modelKey));
  return models().filter((row) => {
    if (provider && row.provider !== provider) return false;
    if (kind && row.kind !== kind) return false;
    if (unpriced && !(row.unpriced30d > 0)) return false;
    if (status === "used" && !(row.generations30d > 0 || row.spend30dUSD > 0 || row.generationsMonthToDate > 0)) return false;
    if (status === "failing" && !failing.has(modelKey(row))) return false;
    if (status === "inflight" && !(row.outcomes?.pending > 0)) return false;
    if (status === "tracked" && !row.outcomes) return false;
    return matchesSearch(`${row.label} ${row.model} ${row.usedBy} ${row.providerName} ${row.kind}`, query);
  });
}

function layout() {
  return html`
    ${pageHeader({ id: "operations", title: "AI Operations", actions: html`<button class="btn btn-secondary" type="button" data-export-models>${icon("download")}Export models</button>` })}
    <div data-slot="unavailable"></div>
    <div class="metric-strip" style="--cols:6">
      ${[["inflight", "In flight"], ["succeeded", "Succeeded"], ["failed", "Failed"], ["cancelled", "Cancelled"], ["rate", "Success rate"], ["undelivered", "Undelivered video"]].map(([key, label]) => html`<div class="metric" data-metric="${key}"><span class="metric-label">${label}</span><span class="metric-value num" data-slot="${key}-value">—</span><span class="metric-sub" data-slot="${key}-sub"></span></div>`)}
    </div>
    <div class="grid">
      <section class="panel span-7">
        <header class="panel-head"><div class="panel-title"><h2>Job outcomes by model</h2><p>Async video, 3D and Studio image jobs · last 30 days</p></div>
          <div class="legend"><span class="legend-item"><span class="legend-swatch" style="--c:var(--ok)"></span>Succeeded</span><span class="legend-item"><span class="legend-swatch" style="--c:var(--crit)"></span>Failed</span><span class="legend-item"><span class="legend-swatch" style="--c:var(--text-4)"></span>Cancelled</span><span class="legend-item"><span class="legend-swatch" style="--c:var(--blue)"></span>In flight</span></div>
        </header>
        <div class="outcome-list" data-slot="outcomes"></div>
      </section>
      <section class="panel span-5">
        <header class="panel-head"><div class="panel-title"><h2>Watch list</h2><p>Reliability, data quality and blind spots</p></div></header>
        <div class="list" data-slot="watch"></div>
      </section>
      <section class="panel span-12" id="models-table">
        <header class="panel-head"><div class="panel-title"><h2>Model monitoring</h2><p>Every configured model · last 30 days · click a row for detail</p></div></header>
        <div class="panel-body filter-row">${filterBarShell({ placeholder: "Search models, IDs, features…" })}</div>
        <div class="table-scroll">
          <table class="data-table models-table">
            <thead><tr><th>Model</th><th>List price</th><th class="num">Generations</th><th class="num">Spend</th><th>Recorded vs list</th><th>Success</th><th class="num">Capacity left</th><th class="num">This month</th></tr></thead>
            <tbody data-slot="models"></tbody>
          </table>
        </div>
      </section>
      <section class="panel span-12" id="undelivered">
        <header class="panel-head"><div class="panel-title"><h2>Undelivered video jobs</h2><p data-slot="leak-sub">Started and billed by the provider, never delivered to the creator</p></div></header>
        <div class="grid inner-grid" data-slot="leak"></div>
      </section>
    </div>`;
}

function setCell(key, value, format, sub, tone = "") {
  const cell = root.querySelector(`[data-metric="${key}"]`);
  if (tone) cell.dataset.tone = tone;
  else delete cell.dataset.tone;
  setValue(slot(root, `${key}-value`), `ops.${key}`, value, format, { pending: isPending(), unavailable: "Unavailable" });
  patch(slot(root, `${key}-sub`), sub);
}

function renderStrip() {
  const totals = state.finance ? outcomeTotals() : null;
  const leak = state.dashboard?.undeliveredVideo;
  setCell("inflight", totals?.pending ?? null, number, "Queued or running now");
  setCell("succeeded", totals?.succeeded ?? null, number, totals ? `${plural(totals.tracked, "tracked model")}` : "");
  setCell("failed", totals?.failed ?? null, number, "Excludes cancellations", totals?.failed ? "warn" : "");
  setCell("cancelled", totals?.cancelled ?? null, number, "By creators or timeouts");
  setCell("rate", totals?.successRate ?? null, (value) => `${value.toFixed(1)}%`, "Succeeded ÷ finished", totals?.successRate !== null && totals?.successRate !== undefined ? (totals.successRate < 80 ? "crit" : totals.successRate < 95 ? "warn" : "") : "");
  setCell("undelivered", leak ? leak.jobs : null, number, leak ? `${money(leak.estimatedCostUSD, { cents: true })} · last ${leak.windowDays} days` : "", leak?.jobs ? "warn" : "");
}

function renderOutcomes() {
  if (!state.finance) {
    patch(slot(root, "outcomes"), emptyState({ iconName: "ai", title: "Job outcomes unavailable", body: "They come from the provider monitor.", compact: true }));
    return;
  }
  const tracked = models().filter((row) => row.outcomes).sort((lhs, rhs) => {
    const lhsTotal = lhs.outcomes.succeeded + lhs.outcomes.failed + lhs.outcomes.cancelled + lhs.outcomes.pending;
    const rhsTotal = rhs.outcomes.succeeded + rhs.outcomes.failed + rhs.outcomes.cancelled + rhs.outcomes.pending;
    return rhsTotal - lhsTotal;
  });
  patch(slot(root, "outcomes"), tracked.length ? tracked.map((row) => {
    const total = row.outcomes.succeeded + row.outcomes.failed + row.outcomes.cancelled + row.outcomes.pending;
    return html`<button class="outcome-row" type="button" data-open-model="${modelKey(row)}">
      <span class="outcome-name">${providerDot(row.provider)}<span><strong>${row.label}</strong><small>${PROVIDER_NAMES[row.provider]} · ${plural(total, "job")}</small></span></span>
      <span class="outcome-bar">${outcomeBar(row.outcomes)}</span>
      <span class="outcome-rate">${successMarkup(row.outcomes, { compact: true })}</span>
    </button>`.value;
  }).join("") : emptyState({ iconName: "ai", title: "No async jobs in the last 30 days", compact: true }));
}

function renderWatch() {
  const items = [];
  if (state.finance) {
    failingModels().forEach((row) => items.push(html`<button class="list-row" type="button" data-open-model="${modelKey(row)}"><span class="list-icon" data-tone="${row.outcomes.successRate < 70 ? "crit" : "warn"}">${icon(row.outcomes.successRate < 70 ? "critical" : "alert")}</span><span class="list-main wrap"><strong>${row.label} at ${row.outcomes.successRate}% success</strong><span>${number(row.outcomes.failed)} of ${number(row.outcomes.succeeded + row.outcomes.failed)} finished jobs failed in 30 days.</span></span>${icon("chevron-right")}</button>`));
    const inflight = models().filter((row) => row.outcomes?.pending > 0);
    if (inflight.length) items.push(html`<a class="list-row" href="${buildHash("operations", { status: "inflight" })}"><span class="list-icon" data-tone="info">${icon("clock")}</span><span class="list-main wrap"><strong>${plural(inflight.reduce((sum, row) => sum + row.outcomes.pending, 0), "job")} in flight</strong><span>${inflight.map((row) => row.label).join(", ")}. Queue wait is not tracked, so a stuck job looks the same as a running one.</span></span>${icon("chevron-right")}</a>`);
    const quality = state.finance.dataQuality;
    if (quality.unpricedGenerations30d > 0) items.push(html`<a class="list-row" href="${buildHash("operations", { unpriced: "1" })}"><span class="list-icon" data-tone="warn">${icon("finance")}</span><span class="list-main wrap"><strong>${plural(quality.unpricedGenerations30d, "generation")} without a recorded cost</strong><span>Spend for these models is understated.</span></span>${icon("chevron-right")}</a>`);
    if (quality.uncataloguedModels.length) items.push(html`<div class="list-row"><span class="list-icon" data-tone="warn">${icon("info")}</span><span class="list-main wrap"><strong>Uncatalogued models</strong><span>${quality.uncataloguedModels.join(", ")}</span></span><span></span></div>`);
  }
  items.push(html`<div class="list-row"><span class="list-icon">${icon("clock")}</span><span class="list-main wrap"><strong>Not tracked yet</strong><span>Generation time, retries and queue wait are not recorded by the backend, so they are not shown. Adding started/finished timestamps and attempt counts to job documents would enable them.</span></span><span></span></div>`);
  patch(slot(root, "watch"), items.map((item) => item.value).join(""));
}

function renderModels() {
  syncSearch(root);
  if (!state.finance) {
    patch(slot(root, "filters"), "");
    patch(slot(root, "models"), html`<tr><td colspan="8">${emptyState({ iconName: "ai", title: "Model monitoring unavailable", body: "It comes from the provider monitor.", compact: true })}</td></tr>`);
    return;
  }
  const params = state.route.params;
  const rows = filteredModels();
  patch(slot(root, "filters"), filterChips({ dims: dims(), params, count: rows.length, total: models().length }));
  const changed = patch(slot(root, "models"), rows.length ? rows.map((row) => html`<tr class="is-clickable" data-open-model="${modelKey(row)}" tabindex="0">
    <td>${modelCell(row)}</td>
    <td class="wrap price-cell">${row.listPrice}</td>
    <td class="num">${number(row.generations30d)}${row.unpriced30d ? html`<div>${toneBadge("warn", `${number(row.unpriced30d)} unpriced`)}</div>` : ""}</td>
    <td class="num">${money(row.spend30dUSD, { cents: true })}</td>
    <td>${costCompare(row)}</td>
    <td>${successMarkup(row.outcomes)}</td>
    <td class="num">${row.generationsRemaining === null ? html`<span class="faint">—</span>` : `≈${number(row.generationsRemaining)}`}</td>
    <td class="num"><div class="cell-main"><span>${money(row.spendMonthToDateUSD, { cents: true })}</span><span class="cell-sub">${plural(row.generationsMonthToDate, "gen")}</span></div></td>
  </tr>`.value).join("") : html`<tr><td colspan="8">${emptyState({ iconName: "search", title: "No models match these filters", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>`, compact: true })}</td></tr>`);
  const signature = params.toString();
  if (changed && lastSignature !== "" && signature !== lastSignature) animateRows(slot(root, "models"));
  lastSignature = signature;
}

function renderLeak() {
  const leak = state.dashboard?.undeliveredVideo;
  if (!state.dashboard) return;
  if (!leak) {
    patch(slot(root, "leak"), html`<div class="span-12">${emptyState({ iconName: "info", title: "No data yet", body: "Deploy the functions build that reports undeliveredVideo.", compact: true })}</div>`);
    return;
  }
  patch(slot(root, "leak-sub"), `Last ${leak.windowDays} days · ${plural(leak.jobs, "job")} · ${money(leak.estimatedCostUSD, { cents: true })} estimated waste`);
  const userFor = (uid) => users().find((user) => user.uid === uid);
  patch(slot(root, "leak"), html`
    <div class="span-5">
      <table class="data-table compact"><thead><tr><th>Reason</th><th class="num">Jobs</th><th class="num">Est. cost</th></tr></thead>
      <tbody>${leak.byReason.length ? leak.byReason.map((row) => html`<tr><td>${row.reason || "unknown"}</td><td class="num">${number(row.jobs)}</td><td class="num">${money(row.estimatedCostUSD, { cents: true })}</td></tr>`) : html`<tr><td colspan="3" class="faint">No undelivered video spend in this window.</td></tr>`}</tbody></table>
    </div>
    <div class="span-7">
      <div class="list">${leak.recent.length ? leak.recent.slice(0, 10).map((job) => {
        const user = userFor(job.uid);
        return html`<div class="list-row"><span class="list-icon" data-tone="warn">${icon("alert")}</span><span class="list-main"><strong>${job.model || "video"} · ${job.reason || "unknown"}</strong><span>${user ? html`<a href="${buildHash("users", { user: user.quotaSubjectHash })}">${user.email || user.displayName || "User"}</a>` : html`<span class="mono">${shortID(job.uid, 6) || "unknown account"}</span>`} · ${number(job.videoSeconds)}s · ${formatDateTime(job.createdAt)}</span></span><span class="list-side"><strong>${money(job.estimatedCostUSD, { cents: true })}</strong><span>${timeAgo(job.createdAt)}</span></span></div>`;
      }) : emptyState({ iconName: "ok", title: "Nothing undelivered recently", compact: true })}</div>
    </div>`);
}

function exportCSV() {
  const rows = filteredModels().map((row) => [
    row.provider, row.model, row.label, row.kind, row.listPrice, row.generations30d, row.unpriced30d, row.spend30dUSD, row.averageCostUSD, row.nominalCostUSD,
    row.outcomes?.succeeded ?? "", row.outcomes?.failed ?? "", row.outcomes?.cancelled ?? "", row.outcomes?.pending ?? "", row.outcomes?.successRate ?? "",
    row.generationsRemaining ?? "", row.generationsMonthToDate, row.spendMonthToDateUSD
  ]);
  downloadCSV("soundframe-models-30d.csv", ["provider", "model", "label", "kind", "listPrice", "generations30d", "unpriced30d", "spend30dUSD", "averageCostUSD", "listCostUSD",
    "succeeded", "failed", "cancelled", "inFlight", "successRate", "capacityLeft", "generationsMonthToDate", "spendMonthToDateUSD"], rows);
}

export default {
  name: "operations",
  title: "AI Operations",
  mount(element) {
    root = element;
    patch(root, layout());
    bindFilterBar(root, dims);
    root.addEventListener("click", (event) => {
      const model = event.target.closest("[data-open-model]");
      if (model && !event.target.closest("a")) openDrawerRoute("model", model.dataset.openModel);
      if (event.target.closest("[data-export-models]")) exportCSV();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const row = event.target.closest("tr[data-open-model]");
      if (row) openDrawerRoute("model", row.dataset.openModel);
    });
  },
  update({ routeChanged } = {}) {
    patch(slot(root, "meta"), html`<span>Job outcomes over 30 days</span><span class="faint">·</span><span>${state.finance ? `computed ${timeAgo(state.finance.generatedAt)}` : "provider monitor unavailable"}</span>`);
    patch(slot(root, "unavailable"), state.finance ? "" : financeUnavailable());
    renderStrip();
    renderOutcomes();
    renderWatch();
    renderModels();
    renderLeak();
    if (routeChanged && state.route.params.get("tab") === "undelivered") {
      requestAnimationFrame(() => root.querySelector("#undelivered")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }
};

export { unitMoney, callout };
