// Subscribers: what Firebase can see of paid App Store subscriptions, and an explicit picture of what it cannot.
// The backend keeps no subscriber list: a usage record exists only after a subscriber's first AI request of the
// month, and its quotaSubjectHash is SHA-256("transaction:<Apple originalTransactionID>"). Nothing here guesses a link.
import { state } from "../store.js";
import { html, money, number, plural, monthLabel, accountLabel, planLabel, authProviderLabel, timeAgo, PLAN_ORDER } from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, callout, provenance, idChip, animateRows } from "../ui.js";
import { users, subscriptionSource, classifySubjects, hashAppStoreTransaction, findUser, isPending } from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch } from "../filters.js";
import { subscriptionSourceBadge, toneBadge } from "../views.js";
import { openDrawerRoute, buildHash } from "../router.js";
import { downloadCSV } from "../csv.js";

let root;
let lastSignature = "";

function dims() {
  const rows = users();
  return [
    { key: "plan", label: "Plan", options: PLAN_ORDER.filter((label) => rows.some((user) => planLabel(user.subscriptionProductID) === label)).map((label) => ({ value: label, label })) },
    { key: "source", label: "Link status", options: [{ value: "linked", label: "Linked (Apple-verified)" }, { value: "internal-test", label: "Internal test entitlement" }] },
    { key: "signin", label: "Sign-in", options: Array.from(new Set(rows.map((user) => authProviderLabel(user.authProvider)))).sort().map((label) => ({ value: label, label })) }
  ];
}

function filtered() {
  const params = state.route.params;
  const plan = params.get("plan");
  const source = params.get("source");
  const signin = params.get("signin");
  const query = params.get("q") || "";
  return users().filter((user) => {
    if (plan && planLabel(user.subscriptionProductID) !== plan) return false;
    const kind = subscriptionSource(user) === "internal-test" ? "internal-test" : "linked";
    if (source && kind !== source) return false;
    if (signin && authProviderLabel(user.authProvider) !== signin) return false;
    return matchesSearch([user.email, user.displayName, user.uid, user.quotaSubjectHash, planLabel(user.subscriptionProductID)].join(" "), query);
  }).sort((lhs, rhs) => Date.parse(rhs.updatedAt || 0) - Date.parse(lhs.updatedAt || 0));
}

function layout() {
  return html`
    ${pageHeader({ id: "subscribers", title: "Subscribers", actions: html`<button class="btn btn-secondary" type="button" data-export-subs>${icon("download")}Export CSV</button>` })}
    <div data-slot="gap"></div>
    <div class="metric-strip" style="--cols:6" data-slot="strip">
      ${[
        ["visible", "Firebase-visible"],
        ["paying", "Paying (production)"],
        ["test", "Test / internal"],
        ["apple", "Apple active subscriptions"],
        ["unlinked", "Paid, not visible"],
        ["sync", "Sync issues"]
      ].map(([key, label]) => html`<div class="metric" data-metric="${key}"><span class="metric-label"><span>${label}</span><span data-slot="${key}-prov"></span></span><span class="metric-value num" data-slot="${key}-value">—</span><span class="metric-sub" data-slot="${key}-sub"></span></div>`)}
    </div>
    <div class="grid">
      <section class="panel span-8">
        <header class="panel-head"><div class="panel-title"><h2>Subscribers with AI activity</h2><p data-slot="list-sub"></p></div></header>
        <div class="panel-body filter-row">${filterBarShell({ placeholder: "Search email, UID, subscription hash…" })}</div>
        <div class="table-scroll"><table class="data-table stack-mobile"><thead><tr><th>Subscriber</th><th>Plan</th><th>Link</th><th class="num">AI credits</th><th class="num">AI cost</th><th>Last activity</th></tr></thead><tbody data-slot="rows"></tbody></table></div>
      </section>
      <div class="span-4 stack">
        <section class="panel">
          <header class="panel-head"><div class="panel-title"><h2>Find an App Store subscription</h2><p>Exact match by original transaction ID</p></div></header>
          <div class="panel-body">
            <form class="lookup" data-lookup>
              <label class="field"><span>Original transaction ID</span><input name="txid" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="e.g. 2000000812345678"></label>
              <button class="btn btn-secondary" type="submit">${icon("search")}Match</button>
            </form>
            <div data-slot="lookup-result" aria-live="polite"></div>
            <p class="panel-note">Hashed in this browser exactly as the backend does (SHA-256 of “transaction:” + ID); the ID is never sent anywhere. Find IDs in Xcode's StoreKit transaction manager, App Store Server API lookups or a customer's purchase details.</p>
          </div>
        </section>
        <section class="panel">
          <header class="panel-head"><div class="panel-title"><h2>Plans</h2><p data-slot="plans-sub"></p></div></header>
          <div class="list" data-slot="plans"></div>
        </section>
      </div>
      <section class="panel span-12">
        <header class="panel-head"><div class="panel-title"><h2>Closing the visibility gap</h2><p>What it takes to see every paid subscription</p></div>${toneBadge("warn", "Backend work required")}</header>
        <div class="panel-body gap-steps">
          <ol>
            <li><strong>Receive App Store Server Notifications V2.</strong> Add an HTTPS endpoint in Functions, verify Apple's signed payloads, and store each subscription's state by <code>originalTransactionId</code> (SUBSCRIBED, DID_RENEW, EXPIRED, DID_FAIL_TO_RENEW, REFUND…).</li>
            <li><strong>Link by appAccountToken, never by guess.</strong> The backend already checks a transaction's <code>appAccountToken</code> against the signed-in user. Store that token with each notification, and a subscription links to a Firebase UID only when they match.</li>
            <li><strong>Backfill once with the App Store Server API.</strong> Use <em>Get All Subscription Statuses</em> for known transactions, and reconcile monthly against App Store Connect → Sales and Trends → Subscriptions.</li>
            <li><strong>Surface it here.</strong> These cards then become live: Apple active subscriptions, paid-but-unlinked, billing retry / grace period and refunds.</li>
          </ol>
        </div>
      </section>
    </div>`;
}

function setCell(key, { value, format = number, unavailable = "Unavailable", prov = "", sub = "", tone = "" }) {
  const cell = root.querySelector(`[data-metric="${key}"]`);
  if (tone) cell.dataset.tone = tone;
  else delete cell.dataset.tone;
  setValue(slot(root, `${key}-value`), `subs.${key}`, value, format, { pending: isPending(), unavailable });
  patch(slot(root, `${key}-prov`), prov);
  patch(slot(root, `${key}-sub`), sub);
}

function renderStrip() {
  const rows = users();
  const internal = rows.filter((user) => subscriptionSource(user) === "internal-test").length;
  const revenue = state.finance?.overview?.revenue;
  setCell("visible", {
    value: state.dashboard ? rows.length : null,
    prov: provenance("verified", "Linked"),
    sub: "Apple-verified at an AI request this month"
  });
  setCell("paying", {
    value: revenue ? revenue.payingSubscribers : null,
    prov: revenue ? provenance("estimated", "Estimated") : provenance("unavailable", "No source"),
    sub: revenue ? "No Debug/TestFlight requests seen" : "Needs the provider monitor"
  });
  setCell("test", {
    value: revenue ? revenue.testSubscribers + internal : state.dashboard ? internal : null,
    prov: provenance("estimated", "Detected"),
    sub: `${number(internal)} internal test · ${revenue ? `${number(revenue.testSubscribers)} TestFlight/Debug` : "TestFlight unknown"}`
  });
  setCell("apple", { value: null, unavailable: "Unavailable", prov: provenance("unavailable", "No data source"), sub: "App Store data is not connected" });
  setCell("unlinked", { value: null, unavailable: "Unknown", prov: provenance("unavailable", "Not measurable"), sub: "Paid subscribers with no AI use this month" });
  setCell("sync", { value: null, unavailable: "Not tracked", prov: provenance("unavailable", "Not recorded"), sub: "Entitlement failures are not logged" });
}

function renderGap() {
  const count = users().length;
  patch(slot(root, "gap"), callout({
    tone: "info",
    iconName: "unlink",
    title: "A paid App Store subscription can be missing from this page",
    body: `The backend only learns about a subscription when its owner makes an AI request, and keeps no list of App Store subscribers. ${count ? `These ${plural(count, "subscription")} are the ones that used AI in ${monthLabel(state.dashboard?.periodKey)}.` : ""} Anyone who subscribed but has not used AI this month, or whose purchase never reached the backend, is invisible until App Store data is connected (see below). No Apple transaction is ever matched to a user by guesswork.`
  }));
}

function renderRows() {
  if (!state.dashboard) {
    patch(slot(root, "rows"), html`<tr><td colspan="6"><div style="display:grid;gap:10px;padding:12px 0">${Array.from({ length: 5 }, () => html`<span class="skeleton sk-row"></span>`)}</div></td></tr>`);
    return;
  }
  const all = users();
  const rows = filtered();
  const params = state.route.params;
  syncSearch(root, params);
  patch(slot(root, "filters"), filterChips({ dims: dims(), params, count: rows.length, total: all.length }));
  patch(slot(root, "list-sub"), `${monthLabel(state.dashboard.periodKey)} · newest activity first`);
  const changed = patch(slot(root, "rows"), rows.length ? rows.map((user) => html`<tr class="is-clickable" data-open-user="${user.quotaSubjectHash}" tabindex="0">
    <td><div class="cell-main"><strong>${accountLabel(user)}</strong><span class="cell-sub">${authProviderLabel(user.authProvider)} · <span class="mono">${user.quotaSubjectHash.slice(0, 10)}…</span></span></div></td>
    <td data-label="Plan">${planLabel(user.subscriptionProductID)}</td>
    <td data-label="Link">${subscriptionSourceBadge(user)}</td>
    <td class="num" data-label="AI credits">${number(user.creditsUsed)}</td>
    <td class="num" data-label="AI cost">${money(user.providerCostUSD, { cents: true })}</td>
    <td data-label="Last activity">${user.updatedAt ? timeAgo(user.updatedAt) : "—"}</td>
  </tr>`.value).join("") : html`<tr><td colspan="6">${all.length ? emptyState({ iconName: "search", title: "No subscribers match", body: "Clear a filter or search for a different email, UID or hash.", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>` }) : emptyState({ iconName: "subscribers", title: "No subscriber has used AI this month", body: "Subscribers appear after their first AI request of the billing period. Paid subscriptions without AI use are not visible yet." })}</td></tr>`);
  const signature = `${params.toString()}`;
  if (changed && lastSignature && signature !== lastSignature) animateRows(slot(root, "rows"));
  lastSignature = signature;
}

function renderPlans() {
  const rows = users();
  const profit = state.finance?.profitability?.rows || [];
  patch(slot(root, "plans-sub"), state.finance ? "Visible subscribers · net price after Apple's cut" : "Visible subscribers");
  patch(slot(root, "plans"), PLAN_ORDER.map((label) => {
    const count = rows.filter((user) => planLabel(user.subscriptionProductID) === label).length;
    const row = profit.find((entry) => entry.label === label);
    if (!count && !row?.payingSubscribers) return "";
    return html`<a class="list-row" href="${buildHash("subscribers", { plan: label })}"><span class="list-main"><strong>${label}</strong><span>${row?.netMonthlyUSD !== null && row?.netMonthlyUSD !== undefined ? `${money(row.netMonthlyUSD, { cents: true })} net / month` : "Price not set"}</span></span><span class="list-side"><strong>${number(count)}</strong><span>${row?.revenueUSD !== null && row?.revenueUSD !== undefined ? `${money(row.revenueUSD, { cents: true })}/mo est.` : ""}</span></span></a>`.value;
  }).join("") || emptyState({ iconName: "subscribers", title: "No plans to show", compact: true }));
}

async function lookup(form) {
  const input = form.elements.txid;
  const value = input.value.trim();
  const result = slot(root, "lookup-result");
  if (!/^\d{6,25}$/.test(value)) {
    patch(result, callout({ tone: "warn", title: "Enter a numeric original transaction ID", body: "Apple transaction IDs are digits only (usually 15–16)." }));
    return;
  }
  if (!crypto?.subtle) {
    patch(result, callout({ tone: "warn", title: "Hashing is unavailable", body: "This browser context does not support Web Crypto (it needs HTTPS)." }));
    return;
  }
  const hash = await hashAppStoreTransaction(value);
  const user = findUser(hash);
  patch(result, user
    ? callout({ tone: "ok", iconName: "link", title: `Linked to ${accountLabel(user)}`, body: `${planLabel(user.subscriptionProductID)} · ${number(user.creditsUsed)} credits this month.`, action: html`<button class="btn btn-secondary btn-sm" type="button" data-open-user="${user.quotaSubjectHash}">Open</button>` })
    : callout({ tone: "info", iconName: "unlink", title: "Not visible this billing period", body: `No usage record matches. The subscription has not made an AI request in ${monthLabel(state.dashboard?.periodKey)}, its purchase never reached the backend, or the ID is wrong. This is not evidence that it is unpaid.` }));
}

function exportCSV() {
  const rows = filtered().map((user) => [
    accountLabel(user), user.uid, user.quotaSubjectHash, planLabel(user.subscriptionProductID),
    subscriptionSource(user) === "internal-test" ? "internal-test" : "linked", authProviderLabel(user.authProvider),
    user.creditsUsed, user.providerCostUSD, user.updatedAt
  ]);
  downloadCSV(`soundframe-subscribers-${state.dashboard?.periodKey || "current"}.csv`, ["account", "uid", "subscriptionHash", "plan", "link", "signIn", "creditsUsed", "providerCostUSD", "lastActivity"], rows);
}

export default {
  exportCSV,
  name: "subscribers",
  title: "Subscribers",
  mount(element) {
    root = element;
    patch(root, layout());
    bindFilterBar(root, dims);
    root.addEventListener("click", (event) => {
      const row = event.target.closest("[data-open-user]");
      if (row) openDrawerRoute("user", row.dataset.openUser);
      if (event.target.closest("[data-export-subs]")) exportCSV();
    });
    root.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const row = event.target.closest("tr[data-open-user]");
      if (row) openDrawerRoute("user", row.dataset.openUser);
    });
    root.querySelector("[data-lookup]").addEventListener("submit", (event) => {
      event.preventDefault();
      lookup(event.currentTarget);
    });
  },
  async update() {
    patch(slot(root, "meta"), html`<span>Billing period ${monthLabel(state.dashboard?.periodKey || state.finance?.periodKey)}</span><span class="faint">·</span><span>Apple-verified at each AI request · entitlements are not stored</span>`);
    renderGap();
    renderStrip();
    renderRows();
    renderPlans();
    if (state.dashboard) {
      const before = state.subjectKinds.size;
      await classifySubjects(users());
      if (state.subjectKinds.size !== before) {
        renderStrip();
        renderRows();
      }
    }
  }
};

export { idChip };
