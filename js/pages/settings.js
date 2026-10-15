// Settings: dashboard preferences (this browser only) and a read-only view of the server-side finance settings.
import { state, prefs, savePrefs } from "../store.js";
import { html, money, timeAgo, formatDateTime, planLabel, PROVIDER_FULL_NAMES } from "../format.js";
import { icon, patch, slot, pageHeader, emptyState, syncSegmented } from "../ui.js";
import { RANGE_PRESETS } from "../data.js";
import { openFinanceSettings } from "../dialogs.js";
import { financeUnavailable } from "./finance.js";

let root;

function segmented(name, value, options) {
  return html`<div class="segmented" role="group" aria-label="${name}" data-pref="${name}">${options.map(([optionValue, label]) => html`<button type="button" data-value="${optionValue}" aria-pressed="${String(value === optionValue)}">${label}</button>`)}</div>`;
}

function layout() {
  return html`
    ${pageHeader({ id: "settings", title: "Settings" })}
    <div class="grid">
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Dashboard preferences</h2><p>Saved in this browser only</p></div></header>
        <div class="settings-list" data-slot="prefs"></div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Finance monitoring</h2><p data-slot="finance-sub">Server-side · applies to every admin</p></div>
          <button class="btn btn-secondary btn-sm" type="button" data-edit-finance>${icon("edit")}Edit</button></header>
        <div class="panel-body" data-slot="finance"></div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Keyboard shortcuts</h2></div></header>
        <div class="list">
          ${[["⌘K / Ctrl K", "Command palette: pages, users, events, models, actions"], ["/", "Open the command palette"], ["[", "Collapse or expand the sidebar"], ["⌘R / Ctrl R", "Refresh data (Shift for a full page reload)"], ["Esc", "Close a drawer, menu or dialog"], ["↑ ↓ ↵", "Move and open in menus and the palette"]].map(([keys, label]) => html`<div class="list-row"><span class="kbd">${keys}</span><span class="list-main"><span>${label}</span></span><span></span></div>`)}
        </div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Data and refresh policy</h2></div></header>
        <div class="panel-body prose">
          <p><strong>Dashboard</strong> (users, events, usage, audit) refreshes every 45 seconds while this tab is visible and auto-refresh is on. It pauses while a form is open.</p>
          <p><strong>Provider monitor</strong> (balances, spend history, models, margins) reads months of events, so it loads once, then at most every 10 minutes while a finance page is open, or when you press Refresh.</p>
          <p><strong>Sync balances</strong> calls the provider billing APIs. It runs automatically every 6 hours on the server.</p>
          <p>Nothing on this page triggers a paid generation or changes credits, prices or balances.</p>
        </div>
      </section>
    </div>`;
}

function renderPrefs() {
  patch(slot(root, "prefs"), html`
    <div class="setting-row"><div><strong>Sidebar</strong><span>Rail keeps icons only. Shortcut: [</span></div>${segmented("sidebar", prefs.sidebar, [["expanded", "Expanded"], ["rail", "Rail"]])}</div>
    <div class="setting-row"><div><strong>Density</strong><span>Compact fits more table rows</span></div>${segmented("density", prefs.density, [["comfortable", "Comfortable"], ["compact", "Compact"]])}</div>
    <div class="setting-row"><div><strong>Motion</strong><span>System follows your OS “reduce motion” setting</span></div>${segmented("motion", prefs.motion, [["system", "System"], ["reduced", "Reduced"], ["full", "Full"]])}</div>
    <div class="setting-row"><div><strong>Default date range</strong><span>Used by Overview and Finance charts</span></div>
      <select class="select" data-pref-select="range" aria-label="Default date range">${RANGE_PRESETS.map((preset) => html`<option value="${preset.id}"${prefs.range === preset.id ? html` selected` : ""}>${preset.label}</option>`)}${prefs.range === "custom" ? html`<option value="custom" selected>Custom</option>` : ""}</select></div>
    <div class="setting-row"><div><strong>Compare with the previous period</strong><span>Adds deltas and a dashed comparison line</span></div><label class="switch"><input type="checkbox" data-pref-toggle="compare"${prefs.compare ? html` checked` : ""}><span class="switch-track"></span><span class="sr-only">Compare</span></label></div>
    <div class="setting-row"><div><strong>Auto-refresh</strong><span>Every 45 seconds while this tab is visible</span></div><label class="switch"><input type="checkbox" data-pref-toggle="autoRefresh"${prefs.autoRefresh ? html` checked` : ""}><span class="switch-track"></span><span class="sr-only">Auto-refresh</span></label></div>
  `);
  root.querySelectorAll("[data-pref]").forEach(syncSegmented);
}

function renderFinance() {
  const finance = state.finance;
  root.querySelector("[data-edit-finance]").disabled = !finance;
  if (!finance) {
    patch(slot(root, "finance"), financeUnavailable() || emptyState({ iconName: "settings", title: "Loading", compact: true }));
    return;
  }
  const settings = finance.settings;
  patch(slot(root, "finance-sub"), settings.updatedAt ? `Updated ${timeAgo(settings.updatedAt)}${settings.updatedBy ? ` by ${settings.updatedBy}` : ""}` : "Defaults · never edited");
  const perProvider = Object.entries(settings.thresholds.perProvider || {});
  const manual = Object.entries(settings.manualBalances || {});
  patch(slot(root, "finance"), html`<dl class="kv-grid">
    <div><dt>Low-balance alerts</dt><dd>Warn below ${money(settings.thresholds.warningUSD, { cents: true })} · critical below ${money(settings.thresholds.criticalUSD, { cents: true })}${perProvider.length ? html`<br><span class="faint">${perProvider.map(([id, pair]) => `${PROVIDER_FULL_NAMES[id]}: ${money(pair.warningUSD, { cents: true })} / ${money(pair.criticalUSD, { cents: true })}`).join(" · ")}</span>` : ""}</dd></div>
    <div><dt>Runway alerts</dt><dd>Warn under ${settings.runway.warningDays} days · critical under ${settings.runway.criticalDays}</dd></div>
    <div><dt>Spend spikes</dt><dd>${settings.spike.multiplier}× the 7-day average, days over ${money(settings.spike.minimumDailyUSD, { cents: true })}</dd></div>
    <div><dt>Apple commission</dt><dd>${Math.round(settings.revenue.appleCommissionRate * 100)}%</dd></div>
    <div><dt>Plan prices</dt><dd>${Object.entries(settings.revenue.planPricesUSD).map(([id, price]) => `${planLabel(id)} ${price === null ? "unknown" : money(price, { cents: true })}`).join(" · ")}</dd></div>
    <div><dt>Manual balances</dt><dd>${manual.length ? manual.map(([id, entry]) => `${PROVIDER_FULL_NAMES[id]} ${money(entry.amountUSD, { cents: true })} (${formatDateTime(entry.asOf)})`).join(" · ") : "None recorded"}</dd></div>
    <div><dt>Google billing export</dt><dd>${settings.googleBillingExportTable ? html`<code>${settings.googleBillingExportTable}</code>` : "Not configured"}</dd></div>
    <div><dt>BytePlus billing region</dt><dd><code>${settings.bytePlusBillingRegion}</code></dd></div>
  </dl>`);
}

export default {
  name: "settings",
  title: "Settings",
  mount(element) {
    root = element;
    patch(root, layout());
    root.addEventListener("click", (event) => {
      const option = event.target.closest("[data-pref] [data-value]");
      if (option) {
        const name = option.closest("[data-pref]").dataset.pref;
        const value = option.dataset.value;
        savePrefs({ [name]: value });
        renderPrefs();
      }
      if (event.target.closest("[data-edit-finance]")) openFinanceSettings();
    });
    root.addEventListener("change", (event) => {
      const toggle = event.target.closest("[data-pref-toggle]");
      if (toggle) savePrefs({ [toggle.dataset.prefToggle]: toggle.checked });
      const select = event.target.closest("[data-pref-select]");
      if (select) savePrefs({ [select.dataset.prefSelect]: select.value });
    });
  },
  update() {
    patch(slot(root, "meta"), html`<span>Preferences and monitoring configuration</span>`);
    renderPrefs();
    renderFinance();
  }
};
