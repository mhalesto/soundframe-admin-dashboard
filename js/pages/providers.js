// Provider Health: balances, runway, capacity and billing-sync status per AI provider.
import { state } from "../store.js";
import { html, money, unitMoney, number, plural, timeAgo, formatDateTime, PROVIDER_COLORS } from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, provenance } from "../ui.js";
import { providerCards, credential, isPending } from "../data.js";
import { balanceBlock, runwayMeter, syncRows, statusPill, providerStatusTone, providerStatusLabel, toneBadge, providerDot, balanceActions } from "../views.js";
import { openDrawerRoute } from "../router.js";
import { openFinanceSettings } from "../dialogs.js";
import { financeUnavailable } from "./finance.js";

let root;
let actions = { sync: () => {} };

function layout() {
  return html`
    ${pageHeader({ id: "providers", title: "Provider Health", actions: html`
      <button class="btn btn-secondary" type="button" data-finance-settings>${icon("settings")}Thresholds &amp; balances</button>
      <button class="btn btn-primary" type="button" data-finance-sync>${icon("refresh")}<span>Sync balances</span></button>` })}
    <div data-slot="unavailable"></div>
    <div class="metric-strip" style="--cols:4">
      ${[["verified", "Verified balances"], ["estimated", "Estimated balances"], ["attention", "Providers needing attention"], ["runway", "Shortest runway"]].map(([key, label]) => html`<div class="metric" data-metric="${key}"><span class="metric-label"><span>${label}</span><span data-slot="${key}-prov"></span></span><span class="metric-value num" data-slot="${key}-value">—</span><span class="metric-sub" data-slot="${key}-sub"></span></div>`)}
    </div>
    <div class="provider-grid" data-slot="cards"></div>
    <section class="panel">
      <header class="panel-head"><div class="panel-title"><h2>Billing access</h2><p>What each provider's billing API allows and how the last sync went</p></div></header>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>Provider</th><th>Balance API</th><th>Spend API</th><th>Last attempt</th><th>Last success</th><th>Latest message</th></tr></thead><tbody data-slot="matrix"></tbody></table></div>
      <footer class="panel-foot"><span>Billing API keys live in Firebase Secret Manager, never in this dashboard.</span><span>Auto-sync every 6 hours</span></footer>
    </section>`;
}

function setCell(key, value, format, { unavailable = "Unavailable", prov = "", sub = "", tone = "" } = {}) {
  const cell = root.querySelector(`[data-metric="${key}"]`);
  if (tone) cell.dataset.tone = tone;
  else delete cell.dataset.tone;
  setValue(slot(root, `${key}-value`), `providers.${key}`, value, format, { pending: isPending(), unavailable });
  patch(slot(root, `${key}-prov`), prov);
  patch(slot(root, `${key}-sub`), sub);
}

function renderStrip() {
  const finance = state.finance;
  const overview = finance?.overview;
  const names = (ids) => ids.map((id) => providerCards().find((card) => card.id === id)?.name || id).join(", ");
  const estimated = providerCards().filter((card) => card.balance.kind === "manual_estimate");
  const critical = providerCards().some((card) => card.status === "critical");
  const cents = (value) => money(value, { cents: true });
  setCell("verified", overview ? overview.verifiedBalanceUSD : null, cents, {
    unavailable: overview ? "None verified" : "Unavailable",
    prov: overview?.verifiedBalanceUSD !== null && overview ? provenance("verified", "Verified") : provenance("unavailable", "Unavailable"),
    sub: overview ? (overview.verifiedBalanceProviders.length ? `${names(overview.verifiedBalanceProviders)} · by API` : "No balance verified yet") : ""
  });
  setCell("estimated", overview ? overview.estimatedBalanceUSD : null, cents, {
    unavailable: overview ? "Not recorded" : "Unavailable",
    prov: overview?.estimatedBalanceUSD !== null && overview ? provenance("estimated", "Estimated") : provenance("unavailable", "Unavailable"),
    sub: overview ? (estimated.length ? `${names(estimated.map((card) => card.id))} · manual − tracked spend` : "Record a manual balance in settings") : ""
  });
  setCell("attention", overview ? overview.providersRequiringAttention : null, number, {
    tone: critical ? "crit" : overview?.providersRequiringAttention ? "warn" : "",
    sub: overview ? `${plural(providerCards().filter((card) => card.status === "unavailable").length, "provider")} without balance data` : ""
  });
  setCell("runway", overview ? overview.shortestRunwayDays : null, (value) => `${value < 10 ? value.toFixed(1) : Math.round(value)} days`, {
    unavailable: overview ? "Needs a balance" : "Unavailable",
    tone: overview?.shortestRunwayDays !== null && overview?.shortestRunwayDays !== undefined ? (overview.shortestRunwayDays <= (finance.settings.runway.criticalDays || 5) ? "crit" : overview.shortestRunwayDays <= (finance.settings.runway.warningDays || 14) ? "warn" : "") : "",
    sub: overview ? `Warn at ${finance.settings.runway.warningDays} days · critical at ${finance.settings.runway.criticalDays}` : ""
  });
}

function providerCard(card) {
  const spend = card.estimatedSpend;
  const recommendation = (state.finance.recommendations || []).find((item) => item.title.includes(card.name));
  const problems = [card.sync.balanceStatus, card.sync.spendStatus].filter((status) => status === "error" || status === "permission_denied");
  return html`<article class="panel provider-card status-${card.status}" style="--provider:${PROVIDER_COLORS[card.id]}">
    <header class="provider-card-head">
      <div class="provider-name">${providerDot(card.id)}<h2>${card.name}</h2></div>
      ${statusPill(providerStatusTone(card), providerStatusLabel(card))}
    </header>
    <div class="provider-card-body">
      ${balanceBlock(card)}
      ${runwayMeter(card, state.finance.settings)}
      <div class="mini-stats" style="--cols:3">
        <div><span>Today</span><strong>${money(spend.todayUSD, { cents: true })}</strong><small>7d avg ${money(spend.dailyAverage7USD, { cents: true })}</small></div>
        <div><span>This month</span><strong>${money(spend.monthToDateUSD, { cents: true })}</strong><small>${card.verifiedSpend ? `billed ${money(card.verifiedSpend.monthToDate, { cents: true })}` : "billing not verified"}</small></div>
        <div><span>Capacity</span><strong>${card.capacity.generationsRemaining === null ? "—" : `≈${number(card.capacity.generationsRemaining)}`}</strong><small>${card.capacity.averageCostPerGenerationUSD ? `at ${unitMoney(card.capacity.averageCostPerGenerationUSD)}` : "no priced gens"}</small></div>
      </div>
      ${syncRows(card)}
      ${problems.length ? html`<p class="provider-problem">${icon("alert")}${(card.sync.messages || []).find((message) => /fail|reject|denied|invalid|did not|401|403/i.test(message)) || "The last billing sync reported a problem."}</p>` : ""}
      ${recommendation ? html`<p class="provider-tip">${icon("info")}<span><strong>${recommendation.title}.</strong> ${recommendation.detail}</span></p>` : ""}
    </div>
    <footer class="panel-foot"><button class="link-btn" type="button" data-open-provider="${card.id}">Details &amp; billing access ${icon("arrow-right")}</button>${balanceActions(card)}</footer>
  </article>`;
}

function renderCards() {
  if (!state.finance) {
    patch(slot(root, "cards"), state.financeLoading ? html`${Array.from({ length: 3 }, () => html`<div class="panel"><div class="panel-body" style="display:grid;gap:12px"><span class="skeleton sk-line" style="width:40%"></span><span class="skeleton sk-value"></span><span class="skeleton sk-row"></span><span class="skeleton sk-row"></span></div></div>`)}` : "");
    patch(slot(root, "matrix"), html`<tr><td colspan="6">${emptyState({ iconName: "providers", title: "Billing status unavailable", body: "It comes from the provider monitor.", compact: true })}</td></tr>`);
    return;
  }
  const order = { critical: 0, warning: 1, ok: 2, unavailable: 3 };
  const cards = [...providerCards()].sort((lhs, rhs) => (order[lhs.status] ?? 4) - (order[rhs.status] ?? 4));
  patch(slot(root, "cards"), cards.map((card) => providerCard(card).value).join(""));
  patch(slot(root, "matrix"), providerCards().map((card) => {
    const balance = credential(card.sync.balanceStatus);
    const spend = credential(card.sync.spendStatus);
    const message = (card.sync.messages || [])[card.sync.messages.length - 1] || "—";
    return html`<tr class="is-clickable" data-open-provider="${card.id}" tabindex="0">
      <td><span class="bar-row-title">${providerDot(card.id)}<span>${card.name}</span></span></td>
      <td>${toneBadge(balance.tone, balance.label)}</td>
      <td>${toneBadge(spend.tone, spend.label)}</td>
      <td>${card.sync.lastAttemptAt ? html`<span data-tip="${formatDateTime(card.sync.lastAttemptAt)}">${timeAgo(card.sync.lastAttemptAt)}</span>` : "Never"}</td>
      <td>${card.sync.lastSuccessAt ? timeAgo(card.sync.lastSuccessAt) : html`<span class="faint">Never</span>`}</td>
      <td class="wrap message-cell">${message}</td>
    </tr>`.value;
  }).join(""));
}

export default {
  name: "providers",
  title: "Provider Health",
  configure(options) {
    actions = { ...actions, ...options };
  },
  mount(element) {
    root = element;
    patch(root, layout());
    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-finance-settings]")) openFinanceSettings();
      const record = event.target.closest("[data-record-balance]");
      if (record) openFinanceSettings({ focusManual: record.dataset.recordBalance });
      const sync = event.target.closest("[data-finance-sync]");
      if (sync) actions.sync(sync);
      if (event.target.closest("[data-retry-finance]")) actions.reloadFinance?.();
      const provider = event.target.closest("[data-open-provider]");
      if (provider && !event.target.closest("a")) openDrawerRoute("provider", provider.dataset.openProvider);
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const row = event.target.closest("tr[data-open-provider]");
      if (row) openDrawerRoute("provider", row.dataset.openProvider);
    });
  },
  update() {
    const finance = state.finance;
    const attempts = (finance?.providers || []).map((card) => Date.parse(card.sync.lastAttemptAt)).filter(Number.isFinite);
    patch(slot(root, "meta"), finance
      ? html`<span>${attempts.length ? `Billing synced ${timeAgo(Math.max(...attempts))}` : "Billing never synced — press Sync balances"}</span><span class="faint">·</span><span>auto-sync every 6 hours</span><span class="faint">·</span><span>figures computed ${timeAgo(finance.generatedAt)}</span>`
      : html`<span>Balances, runway and billing access</span>`);
    root.querySelectorAll("[data-finance-settings], [data-finance-sync]").forEach((button) => { button.disabled = !finance; });
    patch(slot(root, "unavailable"), finance ? "" : financeUnavailable());
    renderStrip();
    renderCards();
  }
};
