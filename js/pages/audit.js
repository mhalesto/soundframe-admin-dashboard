// Audit: admin change history (limit edits, finance settings, billing syncs), newest first, grouped by day.
import { state } from "../store.js";
import { html, plural, formatDay, timeAgo, accountLabel, shortID } from "../format.js";
import { icon, patch, slot, pageHeader, emptyState, animateRows } from "../ui.js";
import { findUser } from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch, distinctOptions } from "../filters.js";
import { openDrawerRoute } from "../router.js";
import { downloadCSV } from "../csv.js";

let root;
let lastSignature = "";

const ACTION_META = {
  updateUserLimits: { label: "User limits", icon: "users", tone: "lavender" },
  updateFinanceSettings: { label: "Finance settings", icon: "settings", tone: "info" },
  syncFinance: { label: "Billing sync", icon: "refresh", tone: "mint" }
};

function meta(action) {
  return ACTION_META[action] || { label: action || "Change", icon: "audit", tone: "" };
}

function entries() {
  return state.dashboard?.auditLog || [];
}

function dims() {
  const list = entries();
  return [
    { key: "action", label: "Change type", options: distinctOptions(list.map((entry) => entry.action), (action) => meta(action).label) },
    { key: "admin", label: "Admin", options: distinctOptions(list.map((entry) => entry.byEmail || entry.byUID), (value) => value.includes("@") ? value : `UID ${shortID(value, 6)}`) }
  ];
}

function filtered() {
  const params = state.route.params;
  const action = params.get("action");
  const admin = params.get("admin");
  const query = params.get("q") || "";
  return entries().filter((entry) => {
    if (action && entry.action !== action) return false;
    if (admin && (entry.byEmail || entry.byUID) !== admin) return false;
    const user = entry.quotaSubjectHash ? findUser(entry.quotaSubjectHash) : null;
    return matchesSearch([entry.changes, entry.note, entry.byEmail, entry.byUID, entry.action, entry.quotaSubjectHash, user?.email].join(" "), query);
  });
}

function layout() {
  return html`
    ${pageHeader({ id: "audit", title: "Audit", actions: html`<button class="btn btn-secondary" type="button" data-export-audit>${icon("download")}Export CSV</button>` })}
    <section class="panel">
      <div class="panel-body filter-row">${filterBarShell({ placeholder: "Search changes, notes, admins…" })}</div>
      <div class="timeline" data-slot="timeline"></div>
    </section>`;
}

function render() {
  syncSearch(root);
  if (!state.dashboard) {
    patch(slot(root, "timeline"), html`<div class="panel-body" style="display:grid;gap:10px">${Array.from({ length: 5 }, () => html`<span class="skeleton sk-row"></span>`)}</div>`);
    return;
  }
  const all = entries();
  const rows = filtered();
  const params = state.route.params;
  patch(slot(root, "filters"), filterChips({ dims: dims(), params, count: rows.length, total: all.length }));
  if (!rows.length) {
    patch(slot(root, "timeline"), all.length
      ? emptyState({ iconName: "search", title: "No changes match", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>` })
      : emptyState({ iconName: "audit", title: "No admin changes recorded yet", body: "Limit edits, finance settings changes and billing syncs appear here." }));
    return;
  }
  const groups = new Map();
  rows.forEach((entry) => {
    const day = String(entry.at || "").slice(0, 10) || "unknown";
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(entry);
  });
  const changed = patch(slot(root, "timeline"), Array.from(groups.entries()).map(([day, list]) => html`<div class="timeline-day"><p class="eyebrow timeline-label">${day === "unknown" ? "Unknown date" : formatDay(`${day}T00:00:00Z`, { year: true })}</p>
    <div class="list">${list.map((entry) => {
      const info = meta(entry.action);
      const user = entry.quotaSubjectHash ? findUser(entry.quotaSubjectHash) : null;
      return html`<button class="list-row" type="button" data-open-entry="${entry.id}">
        <span class="list-icon" data-tone="${info.tone}">${icon(info.icon)}</span>
        <span class="list-main wrap"><strong>${entry.changes || info.label}</strong><span>${info.label}${user ? ` · ${accountLabel(user)}` : entry.quotaSubjectHash ? ` · subscription ${shortID(entry.quotaSubjectHash, 6)}` : ""}${entry.note ? ` · “${entry.note}”` : ""}</span></span>
        <span class="list-side"><strong>${entry.byEmail || shortID(entry.byUID, 6) || "Unknown admin"}</strong><span>${timeAgo(entry.at)}</span></span>
      </button>`;
    })}</div></div>`.value).join(""));
  const signature = params.toString();
  if (changed && lastSignature !== "" && signature !== lastSignature) animateRows(slot(root, "timeline"), ".list-row");
  lastSignature = signature;
}

function exportCSV() {
  const rows = filtered().map((entry) => [entry.at, entry.action, entry.changes, entry.note, entry.quotaSubjectHash, entry.byEmail, entry.byUID]);
  downloadCSV("soundframe-admin-audit.csv", ["at", "action", "changes", "note", "subscriptionHash", "byEmail", "byUID"], rows);
}

export default {
  exportCSV,
  name: "audit",
  title: "Audit",
  mount(element) {
    root = element;
    patch(root, layout());
    bindFilterBar(root, dims);
    root.addEventListener("click", (event) => {
      const entry = event.target.closest("[data-open-entry]");
      if (entry) openDrawerRoute("entry", entry.dataset.openEntry);
      if (event.target.closest("[data-export-audit]")) exportCSV();
    });
  },
  update() {
    patch(slot(root, "meta"), html`<span>Admin change history</span><span class="faint">·</span><span>${state.dashboard ? `newest ${plural(entries().length, "entry", "entries")}` : "loading"}</span><span class="faint">·</span><span>Written server-side; this page cannot edit it</span>`);
    render();
  }
};
