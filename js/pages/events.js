// Events: the generation ledger (newest 80 events) and the 14-day request/video volume.
import { state, prefs } from "../store.js";
import { html, money, number, plural, formatDay, formatDateTime, timeAgo, actionLabel, kindLabel, providerId, PROVIDER_NAMES, accountLabel, shortID } from "../format.js";
import { icon, patch, slot, pageHeader, emptyState, animateRows } from "../ui.js";
import { events, users, resolveRange } from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch, distinctOptions } from "../filters.js";
import { providerDot, eventIconTone } from "../views.js";
import { openDrawerRoute, setParams } from "../router.js";
import { upsertChart, baseOptions, CHART_COLORS } from "../charts.js";
import { downloadCSV } from "../csv.js";

let root;
let lastSignature = "";

function userByUID(uid) {
  return users().find((user) => user.uid && user.uid === uid) || null;
}

function dims() {
  const list = events();
  const dayOptions = distinctOptions(list.map((event) => String(event.createdAt).slice(0, 10)), (day) => formatDay(`${day}T00:00:00Z`)).reverse();
  return [
    { key: "provider", label: "Provider", options: distinctOptions(list.map((event) => providerId(event.provider)), (id) => PROVIDER_NAMES[id]) },
    { key: "kind", label: "Kind", options: distinctOptions(list.map((event) => event.usageKind), kindLabel) },
    { key: "action", label: "Feature", options: distinctOptions(list.map((event) => event.action), actionLabel) },
    { key: "model", label: "Model", options: distinctOptions(list.map((event) => event.model)) },
    { key: "day", label: "Day", options: dayOptions },
    { key: "uid", label: "User", options: distinctOptions(list.map((event) => event.uid), (uid) => { const user = userByUID(uid); return user ? accountLabel(user) : `UID ${shortID(uid, 6)}`; }) },
    { key: "inrange", label: "Date range", options: [{ value: "1", label: "Only the selected range" }] }
  ];
}

function filtered() {
  const params = state.route.params;
  const provider = params.get("provider");
  const kind = params.get("kind");
  const action = params.get("action");
  const model = params.get("model");
  const day = params.get("day");
  const uid = params.get("uid");
  const inRange = params.get("inrange");
  const query = params.get("q") || "";
  const range = resolveRange();
  return events().filter((event) => {
    if (provider && providerId(event.provider) !== provider) return false;
    if (kind && event.usageKind !== kind) return false;
    if (action && event.action !== action) return false;
    if (model && event.model !== model) return false;
    if (day && String(event.createdAt).slice(0, 10) !== day) return false;
    if (uid && event.uid !== uid) return false;
    if (inRange) {
      const time = Date.parse(event.createdAt);
      if (time < range.start.getTime() || time >= range.end.getTime() + 86400000) return false;
    }
    const user = userByUID(event.uid);
    return matchesSearch([event.action, actionLabel(event.action), event.provider, event.model, event.uid, event.usageKind, event.id, user?.email].join(" "), query);
  });
}

function layout() {
  return html`
    ${pageHeader({ id: "events", title: "Events", actions: html`<button class="btn btn-secondary" type="button" data-export-events>${icon("download")}Export CSV</button>` })}
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Requests and video usage</h2><p data-slot="volume-sub">Last 14 days · delivered generations</p></div>
        <div class="legend"><span class="legend-item"><span class="legend-swatch" style="--c:${CHART_COLORS.muted}"></span>Requests</span><span class="legend-item"><span class="legend-swatch" style="--c:${CHART_COLORS.mint}"></span>Videos</span></div></header>
      <div class="panel-body volume-body">
        <div class="chart-frame" style="--chart-h:180px"><canvas data-slot="volume-chart" role="img" aria-label="Daily requests and video usage over the last 14 days"></canvas></div>
        <div class="chart-summary volume-summary" data-slot="volume-summary"></div>
      </div>
    </section>
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Ledger</h2><p data-slot="ledger-sub"></p></div></header>
      <div class="panel-body filter-row">${filterBarShell({ placeholder: "Search feature, provider, model, UID, email…" })}</div>
      <div class="table-scroll">
        <table class="data-table events-table">
          <thead><tr><th>When</th><th>Feature</th><th class="col-model">Provider · model</th><th class="col-user">User</th><th class="num col-credits">Credits</th><th class="num">Cost</th></tr></thead>
          <tbody data-slot="rows"></tbody>
        </table>
      </div>
    </section>`;
}

function renderVolume() {
  const rows = state.dashboard?.usageByDay || [];
  const stats = state.dashboard?.stats;
  upsertChart("events-volume", slot(root, "volume-chart"), () => ({
    type: "bar",
    data: {
      labels: rows.map((row) => formatDay(`${row.day}T00:00:00Z`)),
      datasets: [
        { label: "Requests", data: rows.map((row) => row.requests), backgroundColor: "rgba(243, 245, 246, 0.16)", hoverBackgroundColor: "rgba(243, 245, 246, 0.28)", borderRadius: 3, maxBarThickness: 20, grouped: false, order: 2 },
        { label: "Videos", data: rows.map((row) => row.videos), backgroundColor: CHART_COLORS.mint, borderRadius: 3, maxBarThickness: 10, grouped: false, order: 1 }
      ]
    },
    options: baseOptions({
      yFormat: (value) => number(value),
      maxTicks: 4,
      onClick: (event, elements) => { if (elements[0]) setParams({ day: rows[elements[0].index].day }); },
      tooltipFooter: (items) => {
        const row = rows[items[0]?.dataIndex];
        return row ? `${money(row.providerCostUSD, { cents: true })} · ${number(row.credits)} credits · click to filter` : "";
      }
    })
  }), JSON.stringify(rows));
  patch(slot(root, "volume-summary"), stats ? html`<span><strong>${number(stats.windowRequests)}</strong>requests</span><span><strong>${number(stats.windowVideos)}</strong>videos</span><span><strong>${money(stats.windowProviderCostUSD, { cents: true })}</strong>provider cost</span><span><strong>${number(stats.windowUndeliveredVideos || 0)}</strong>undelivered videos</span>` : "");
}

function renderLedger() {
  syncSearch(root);
  if (!state.dashboard) {
    patch(slot(root, "rows"), html`<tr><td colspan="6"><div style="display:grid;gap:10px;padding:12px 0">${Array.from({ length: 6 }, () => html`<span class="skeleton sk-row"></span>`)}</div></td></tr>`);
    return;
  }
  const all = events();
  const rows = filtered();
  const params = state.route.params;
  const windowTotal = state.dashboard.stats.windowRequests + (state.dashboard.stats.windowUndeliveredVideos || 0);
  patch(slot(root, "ledger-sub"), `Newest ${number(all.length)} of ${number(windowTotal)} events in the last ${state.dashboard.eventWindowDays} days · older events appear only in totals`);
  patch(slot(root, "filters"), filterChips({ dims: dims(), params, count: rows.length, total: all.length }));
  const changed = patch(slot(root, "rows"), rows.length ? rows.map((event) => {
    const [glyph, tone] = eventIconTone(event);
    const provider = providerId(event.provider);
    const user = userByUID(event.uid);
    return html`<tr class="is-clickable${event.action === "videoUndelivered" ? " tone-warn" : ""}" data-open-event="${event.id}" tabindex="0">
      <td class="nowrap"><div class="cell-main"><span>${timeAgo(event.createdAt)}</span><span class="cell-sub">${formatDateTime(event.createdAt)}</span></div></td>
      <td><div class="feature-cell"><span class="list-icon" data-tone="${tone}">${icon(glyph)}</span><div class="cell-main"><strong>${actionLabel(event.action)}</strong><span class="cell-sub">${kindLabel(event.usageKind)}</span></div></div></td>
      <td class="col-model"><div class="cell-main"><span>${providerDot(provider)} ${PROVIDER_NAMES[provider] || event.provider}</span><span class="cell-sub">${event.model || "not recorded"}</span></div></td>
      <td class="col-user">${user ? html`<span class="truncate">${accountLabel(user)}</span>` : html`<span class="mono faint">${shortID(event.uid, 6) || "—"}</span>`}</td>
      <td class="num col-credits">${number(event.credits)}</td>
      <td class="num"><strong>${money(event.providerCostUSD)}</strong></td>
    </tr>`.value;
  }).join("") : html`<tr><td colspan="6">${all.length
    ? emptyState({ iconName: "search", title: "No events match these filters", body: "Clear a filter or broaden the search.", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>` })
    : emptyState({ iconName: "events", title: "No generations in the last 14 days", body: "Events appear as creators use AI features." })}</td></tr>`);
  const signature = params.toString();
  if (changed && lastSignature !== "" && signature !== lastSignature) animateRows(slot(root, "rows"));
  lastSignature = signature;
}

function exportCSV() {
  const rows = filtered().map((event) => [event.createdAt, event.uid, event.action, event.usageKind, event.provider, event.model, event.credits, event.providerCostUSD]);
  downloadCSV("soundframe-events.csv", ["createdAt", "uid", "action", "usageKind", "provider", "model", "credits", "providerCostUSD"], rows);
}

export default {
  exportCSV,
  name: "events",
  title: "Events",
  mount(element) {
    root = element;
    patch(root, layout());
    bindFilterBar(root, dims);
    root.addEventListener("click", (event) => {
      const row = event.target.closest("[data-open-event]");
      if (row && !event.target.closest("a")) openDrawerRoute("event", row.dataset.openEvent);
      if (event.target.closest("[data-export-events]")) exportCSV();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const row = event.target.closest("tr[data-open-event]");
      if (row) openDrawerRoute("event", row.dataset.openEvent);
    });
  },
  update() {
    const range = resolveRange();
    patch(slot(root, "meta"), html`<span>Generation ledger</span><span class="faint">·</span><span>Undelivered video jobs are flagged and excluded from usage totals</span>${prefs.range !== "14d" ? html`<span class="faint">·</span><span>Add the “Date range” filter to limit the ledger to ${range.label.toLowerCase()}</span>` : ""}`);
    renderVolume();
    renderLedger();
  }
};
