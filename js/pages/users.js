// Users: quota management for every account with AI usage this billing period.
import { state } from "../store.js";
import { html, money, number, plural, monthLabel, accountLabel, accountMeta, planLabel, authProviderLabel, timeAgo, PLAN_ORDER, providerId, PROVIDER_NAMES } from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, animateRows } from "../ui.js";
import { users, riskLevel, usageRatio, userStatusTags, usersAtRisk, isPending } from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch } from "../filters.js";
import { usageMeter, riskBadges, providerDot } from "../views.js";
import { openDrawerRoute, setParams } from "../router.js";
import { openLimitDialog } from "../dialogs.js";
import { downloadCSV } from "../csv.js";

let root;
let lastSignature = "";

const COLUMNS = [
  { key: "account", label: "Account" },
  { key: "plan", label: "Plan" },
  { key: "credits", label: "AI credits" },
  { key: "videos", label: "Video clips" },
  { key: "cost", label: "Cost", num: true },
  { key: "model", label: "Last model" },
  { key: "updated", label: "Active" }
];

const STATUS_OPTIONS = [
  { value: "risk", label: "At or near limit" },
  { value: "over", label: "Over limit" },
  { value: "near", label: "Near limit (≥ 90%)" },
  { value: "override", label: "Override active" },
  { value: "paused", label: "Override paused" },
  { value: "ok", label: "Within limits" }
];

function dims() {
  const rows = users();
  return [
    { key: "plan", label: "Plan", options: PLAN_ORDER.filter((label) => rows.some((user) => planLabel(user.subscriptionProductID) === label)).map((label) => ({ value: label, label })) },
    { key: "status", label: "Status", options: STATUS_OPTIONS },
    { key: "signin", label: "Sign-in", options: Array.from(new Set(rows.map((user) => authProviderLabel(user.authProvider)))).sort().map((label) => ({ value: label, label })) },
    { key: "provider", label: "Last provider", options: Array.from(new Set(rows.map((user) => providerId(user.lastProvider)).filter((id) => id !== "other"))).map((id) => ({ value: id, label: PROVIDER_NAMES[id] })) }
  ];
}

function sortState() {
  const value = state.route.params.get("sort") || "cost:desc";
  const [key, dir] = value.split(":");
  return { key: COLUMNS.some((column) => column.key === key) ? key : "cost", dir: dir === "asc" ? "asc" : "desc" };
}

function sortValue(user, key) {
  switch (key) {
    case "account": return accountLabel(user).toLowerCase();
    case "plan": return PLAN_ORDER.indexOf(planLabel(user.subscriptionProductID));
    case "credits": return usageRatio(user.creditsUsed, user.effectiveCreditLimit);
    case "videos": return usageRatio(user.videoUsed, user.effectiveVideoLimit);
    case "cost": return Number(user.providerCostUSD) || 0;
    case "model": return `${user.lastProvider} ${user.lastModel}`.toLowerCase();
    case "updated": return Date.parse(user.updatedAt || 0) || 0;
    default: return 0;
  }
}

function filtered() {
  const params = state.route.params;
  const plan = params.get("plan");
  const status = params.get("status");
  const signin = params.get("signin");
  const provider = params.get("provider");
  const query = params.get("q") || "";
  const { key, dir } = sortState();
  const direction = dir === "asc" ? 1 : -1;
  return users().filter((user) => {
    if (plan && planLabel(user.subscriptionProductID) !== plan) return false;
    if (signin && authProviderLabel(user.authProvider) !== signin) return false;
    if (provider && providerId(user.lastProvider) !== provider) return false;
    if (status) {
      const tags = userStatusTags(user);
      if (status === "risk" && !tags.includes("over") && !tags.includes("near")) return false;
      if (status === "ok" && riskLevel(user) !== "ok") return false;
      if (!["risk", "ok"].includes(status) && !tags.includes(status)) return false;
    }
    return matchesSearch([user.email, user.displayName, user.authProvider, user.uid, user.quotaSubjectHash, user.subscriptionProductID, planLabel(user.subscriptionProductID), user.lastProvider, user.lastModel].join(" "), query);
  }).sort((lhs, rhs) => {
    const left = sortValue(lhs, key);
    const right = sortValue(rhs, key);
    if (typeof left === "string" || typeof right === "string") return String(left).localeCompare(String(right)) * direction;
    return (left - right) * direction;
  });
}

function layout() {
  return html`
    ${pageHeader({ id: "users", title: "Users", actions: html`<button class="btn btn-secondary" type="button" data-export-users>${icon("download")}Export CSV</button>` })}
    <div class="metric-strip" style="--cols:4">
      ${[["active", "Active users", "#users"], ["near", "Near limit", "#users?status=near"], ["over", "Over limit", "#users?status=over"], ["overrides", "Overrides", "#users?status=override"]].map(([key, label, href]) => html`<a class="metric" href="${href}" data-metric="${key}"><span class="metric-label">${label}</span><span class="metric-value num" data-slot="${key}-value">—</span><span class="metric-sub" data-slot="${key}-sub"></span></a>`)}
    </div>
    <section class="panel">
      <div class="panel-body filter-row">${filterBarShell({ placeholder: "Search email, UID, plan, model…" })}</div>
      <div class="table-scroll">
        <table class="data-table users-table stack-mobile">
          <thead><tr>
            ${COLUMNS.map((column) => html`<th scope="col" class="${column.num ? "num" : ""}" data-col="${column.key}"><button class="sort-btn" type="button" data-sort="${column.key}">${column.label}${icon("sort")}</button></th>`)}
            <th scope="col"><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody data-slot="rows"></tbody>
        </table>
      </div>
      <footer class="panel-foot"><span data-slot="foot"></span><span>Limits apply per subscription for the billing month. Every edit is audited.</span></footer>
    </section>`;
}

function renderStrip() {
  const rows = users();
  const stats = state.dashboard?.stats;
  const atRisk = usersAtRisk();
  const over = atRisk.filter((entry) => entry.risk === "over").length;
  const near = atRisk.length - over;
  const paused = rows.filter((user) => user.override?.disabled).length;
  setValue(slot(root, "active-value"), "users.active", stats ? stats.activeUsers : null, number, { pending: isPending() });
  patch(slot(root, "active-sub"), stats ? `${plural(stats.usageRecords, "usage record")} · ${monthLabel(state.dashboard.periodKey)}` : "");
  setValue(slot(root, "near-value"), "users.near", state.dashboard ? near : null, number, { pending: isPending() });
  patch(slot(root, "near-sub"), "≥ 90% of a limit");
  setValue(slot(root, "over-value"), "users.over", state.dashboard ? over : null, number, { pending: isPending() });
  patch(slot(root, "over-sub"), over ? "Blocked from that capability" : "Nobody is blocked");
  root.querySelector('[data-metric="over"]').dataset.tone = over ? "crit" : "";
  root.querySelector('[data-metric="near"]').dataset.tone = near ? "warn" : "";
  setValue(slot(root, "overrides-value"), "users.overrides", stats ? stats.activeOverrides : null, number, { pending: isPending() });
  patch(slot(root, "overrides-sub"), `${plural(paused, "paused override")}`);
}

function renderTable() {
  const params = state.route.params;
  syncSearch(root, params);
  const { key, dir } = sortState();
  root.querySelectorAll("th[data-col]").forEach((th) => {
    th.setAttribute("aria-sort", th.dataset.col === key ? (dir === "asc" ? "ascending" : "descending") : "none");
  });
  if (!state.dashboard) {
    patch(slot(root, "rows"), html`<tr><td colspan="8"><div style="display:grid;gap:10px;padding:12px 0">${Array.from({ length: 6 }, () => html`<span class="skeleton sk-row"></span>`)}</div></td></tr>`);
    return;
  }
  const all = users();
  const rows = filtered();
  patch(slot(root, "filters"), filterChips({ dims: dims(), params, count: rows.length, total: all.length }));
  patch(slot(root, "foot"), `${plural(all.length, "account")} with AI usage in ${monthLabel(state.dashboard.periodKey)}`);
  const changed = patch(slot(root, "rows"), rows.length ? rows.map((user) => {
    const risk = riskLevel(user);
    return html`<tr class="is-clickable${risk === "over" ? " tone-crit" : risk === "near" ? " tone-warn" : ""}" data-open-user="${user.quotaSubjectHash}" tabindex="0">
      <td><div class="cell-main"><strong>${accountLabel(user)}</strong><span class="cell-sub">${accountMeta(user)}</span>${riskBadges(user).value ? html`<span class="cell-badges">${riskBadges(user)}</span>` : ""}</div></td>
      <td data-label="Plan">${planLabel(user.subscriptionProductID)}</td>
      <td data-label="AI credits">${usageMeter(user.creditsUsed, user.effectiveCreditLimit)}</td>
      <td data-label="Video clips">${usageMeter(user.videoUsed, user.effectiveVideoLimit)}</td>
      <td class="num" data-label="Cost">${money(user.providerCostUSD, { cents: true })}</td>
      <td data-label="Last model"><div class="cell-main"><span class="truncate">${user.lastModel || "None"}</span><span class="cell-sub">${user.lastProvider ? html`${providerDot(providerId(user.lastProvider))} ${user.lastProvider}` : ""}</span></div></td>
      <td class="faint" data-label="Active">${user.updatedAt ? timeAgo(user.updatedAt) : "—"}</td>
      <td class="row-actions"><button class="icon-btn icon-btn-sm" type="button" data-edit-user="${user.quotaSubjectHash}" aria-label="Edit limits for ${accountLabel(user)}" data-tip="Edit limits">${icon("edit")}</button></td>
    </tr>`.value;
  }).join("") : html`<tr><td colspan="8">${all.length
    ? emptyState({ iconName: "search", title: "No users match these filters", body: "Clear a filter or search for another email, UID, plan or model.", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>` })
    : emptyState({ iconName: "users", title: "No AI usage this billing period yet", body: "Accounts appear after their first AI request of the month." })}</td></tr>`);
  const signature = params.toString();
  if (changed && lastSignature !== "" && signature !== lastSignature) animateRows(slot(root, "rows"));
  lastSignature = signature;
}

function exportCSV() {
  const rows = filtered().map((user) => [
    user.email, user.displayName, user.authProvider, user.uid, user.quotaSubjectHash, planLabel(user.subscriptionProductID), user.period,
    user.creditsUsed, user.effectiveCreditLimit, user.videoUsed, user.effectiveVideoLimit, user.textUsed, user.imageUsed, user.captionUsed,
    user.providerCostUSD, user.lastProvider, user.lastModel, user.override ? "yes" : "no"
  ]);
  downloadCSV(`soundframe-users-${state.dashboard?.periodKey || "current"}.csv`, [
    "email", "displayName", "authProvider", "uid", "quotaSubjectHash", "plan", "period", "creditsUsed", "effectiveCreditLimit", "videoUsed",
    "effectiveVideoLimit", "textUsed", "imageUsed", "captionUsed", "providerCostUSD", "lastProvider", "lastModel", "hasOverride"
  ], rows);
}

export default {
  exportCSV,
  name: "users",
  title: "Users",
  mount(element) {
    root = element;
    patch(root, layout());
    bindFilterBar(root, dims);
    root.addEventListener("click", (event) => {
      const sort = event.target.closest("[data-sort]");
      if (sort) {
        const current = sortState();
        const keyName = sort.dataset.sort;
        const dir = current.key === keyName ? (current.dir === "asc" ? "desc" : "asc") : (["account", "plan", "model"].includes(keyName) ? "asc" : "desc");
        setParams({ sort: `${keyName}:${dir}` });
        return;
      }
      const edit = event.target.closest("[data-edit-user]");
      if (edit) {
        const user = users().find((candidate) => candidate.quotaSubjectHash === edit.dataset.editUser);
        if (user) openLimitDialog(user);
        return;
      }
      const row = event.target.closest("[data-open-user]");
      if (row && !event.target.closest("a, button")) openDrawerRoute("user", row.dataset.openUser);
      if (event.target.closest("[data-export-users]")) exportCSV();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.target.closest("button")) return;
      const row = event.target.closest("tr[data-open-user]");
      if (row) openDrawerRoute("user", row.dataset.openUser);
    });
  },
  update() {
    patch(slot(root, "meta"), html`<span>Quota management</span><span class="faint">·</span><span>Billing period ${monthLabel(state.dashboard?.periodKey)}</span><span class="faint">·</span><span>Overrides replace plan defaults for one subscription</span>`);
    renderStrip();
    renderTable();
  }
};
