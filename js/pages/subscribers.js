// Subscribers: paid App Store subscriptions from two sources, each labelled for what it can prove.
// - AI activity: usage records exist only after a subscriber's first AI request of the month; their quotaSubjectHash
//   is SHA-256("transaction:<Apple originalTransactionID>").
// - App Store: soundframeAdminAppStoreSubscribers, fed by Apple-signed Server Notifications V2 and keyed by the same
//   hash. A subscription links to a Firebase account only through its appAccountToken. Nothing here guesses a link.
import { state } from "../store.js";
import { html, money, number, plural, monthLabel, accountLabel, planLabel, authProviderLabel, timeAgo, formatDay, formatDateTime, PLAN_ORDER } from "../format.js";
import { icon, patch, slot, setValue, pageHeader, emptyState, callout, provenance, idChip, animateRows, syncSegmented } from "../ui.js";
import {
  users, subscriptionSource, classifySubjects, hashAppStoreTransaction, findUser, isPending,
  appStoreSourceState, appStoreCounts, appStoreRows, findAppStoreSubscription, APP_STORE_ENVIRONMENTS
} from "../data.js";
import { filterBarShell, filterChips, bindFilterBar, syncSearch, matchesSearch } from "../filters.js";
import { subscriptionSourceBadge, toneBadge } from "../views.js";
import { openDrawerRoute, buildHash, navigate } from "../router.js";
import { downloadCSV } from "../csv.js";
import { PROJECT_ID, FUNCTIONS_REGION } from "../api.js";

const NOTIFICATION_URL = `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/soundframeAppStoreNotifications`;

const APPLE_VIEWS = [
  { id: "paying", label: "Paying", match: (row) => row.accessState === "active" || row.accessState === "grace" },
  { id: "attention", label: "Needs attention", match: (row) => ["grace", "billing_retry", "unconfirmed"].includes(row.accessState) },
  { id: "ended", label: "Ended", match: (row) => ["expired", "refunded", "revoked"].includes(row.accessState) },
  { id: "all", label: "All", match: () => true }
];

const ACCESS_BADGES = {
  active: ["ok", "Active", "Apple grants access and the subscription is paid up"],
  grace: ["warn", "Grace period", "Renewal payment failed; Apple keeps access on while it retries"],
  billing_retry: ["warn", "Billing retry", "Renewal payment failed; no access while Apple retries"],
  unconfirmed: ["warn", "Missed notice", "The expiry passed without a renewal or expiry notification from Apple"],
  expired: ["muted", "Expired", "Ended without renewing"],
  refunded: ["crit", "Refunded", "Apple refunded the purchase"],
  revoked: ["crit", "Revoked", "Apple revoked access (for example Family Sharing removed)"]
};

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

function appleView() {
  const id = state.route.params.get("apple");
  return APPLE_VIEWS.find((view) => view.id === id) || APPLE_VIEWS[0];
}

function appleFiltered() {
  const view = appleView();
  const plan = state.route.params.get("plan");
  const query = state.route.params.get("q") || "";
  return appStoreRows().filter((row) => view.match(row) &&
    (!plan || planLabel(row.productId) === plan) &&
    matchesSearch([row.email, row.displayName, row.uid, row.subscriptionHash, planLabel(row.productId), row.environment].join(" "), query));
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
        ["unlinked", "Paid, no AI use"],
        ["sync", "Billing issues"]
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
        <header class="panel-head">
          <div class="panel-title"><h2>App Store subscriptions</h2><p data-slot="appstore-sub"></p></div>
          <div class="panel-tools">
            <div class="segmented" role="group" aria-label="App Store subscriptions shown" data-slot="appstore-view">
              ${APPLE_VIEWS.map((view) => html`<button type="button" data-apple-view="${view.id}" aria-pressed="false">${view.label}</button>`)}
            </div>
            <button class="btn btn-secondary btn-sm" type="button" data-export-apple>${icon("download")}CSV</button>
          </div>
        </header>
        <div class="table-scroll"><table class="data-table stack-mobile"><thead><tr><th>Subscriber</th><th>Plan</th><th>Status</th><th>Link</th><th>AI this month</th><th>Renewal</th></tr></thead><tbody data-slot="appstore-rows"></tbody></table></div>
        <footer class="panel-foot" data-slot="appstore-foot"></footer>
      </section>
      <section class="panel span-12">
        <header class="panel-head"><div class="panel-title"><h2>App Store source</h2><p>How paid subscriptions reach this page</p></div><span data-slot="source-badge"></span></header>
        <div class="panel-body gap-steps"><ol data-slot="source-steps"></ol><dl class="kv-grid" data-slot="source-facts"></dl></div>
      </section>
    </div>`;
}

function setCell(key, { value, format = number, unavailable = "Unavailable", prov = "", sub = "", tone = "", pending = isPending() }) {
  const cell = root.querySelector(`[data-metric="${key}"]`);
  if (tone) cell.dataset.tone = tone;
  else delete cell.dataset.tone;
  setValue(slot(root, `${key}-value`), `subs.${key}`, value, format, { pending, unavailable });
  patch(slot(root, `${key}-prov`), prov);
  patch(slot(root, `${key}-sub`), sub);
}

function trackingSinceLabel() {
  const since = state.appStore?.trackingSince;
  return since ? formatDay(since, { year: true }) : "";
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

  const source = appStoreSourceState();
  const production = appStoreCounts("Production");
  const sandbox = appStoreCounts("Sandbox");
  if (!production) {
    const pending = source === "pending";
    const prov = source === "not-deployed" ? provenance("unavailable", "Not deployed") : provenance("failed", "Unavailable", state.appStoreError?.message || "");
    setCell("apple", { value: null, pending, prov, sub: source === "not-deployed" ? "Deploy the App Store notification functions" : "App Store counts could not be loaded" });
    setCell("unlinked", { value: null, pending, unavailable: "Unknown", prov, sub: "Paid subscribers with no AI use this month" });
    setCell("sync", { value: null, pending, unavailable: "Unknown", prov, sub: "Billing retry, grace period and refunds" });
    return;
  }
  const live = source === "live";
  const since = trackingSinceLabel();
  const lowerBound = provenance("estimated", "Lower bound", live
    ? `Every subscription Apple has reported${since ? ` since ${since}` : ""}. Each subscriber is counted from their first App Store event after tracking began (purchase, renewal, billing issue, refund) or their first AI feature check.`
    : "No App Store notification has arrived yet: only subscribers seen at an AI feature check are counted, and their renewals cannot be confirmed.");
  setCell("apple", {
    value: production.entitled,
    pending: false,
    prov: lowerBound,
    sub: `${number(production.active)} active · ${number(production.grace)} grace${sandbox?.entitled ? ` · +${number(sandbox.entitled)} sandbox` : ""}`
  });
  setCell("unlinked", {
    value: production.paidNoAIUsage,
    pending: false,
    prov: provenance("verified", "Apple + usage", `Paid production subscriptions with no AI usage record in ${monthLabel(state.appStore.periodKey)}`),
    sub: `${number(production.linked)} linked · ${number(production.unlinked)} unlinked${production.ambiguous ? ` · ${number(production.ambiguous)} shared device` : ""}`
  });
  if (live) {
    const billing = production.billingRetry + production.grace;
    setCell("sync", {
      value: billing,
      pending: false,
      tone: billing ? "warn" : "",
      prov: provenance("verified", "Apple-signed"),
      sub: `${number(production.billingRetry)} retry · ${number(production.grace)} grace · ${number(production.refunded)} refunded`
    });
  } else {
    setCell("sync", { value: null, pending: false, unavailable: "Not tracked", prov: provenance("unavailable", "No notifications"), sub: "Needs App Store Server Notifications" });
  }
}

function renderGap() {
  const source = appStoreSourceState();
  const count = users().length;
  if (source === "live") {
    const tracked = APP_STORE_ENVIRONMENTS.reduce((sum, environment) => sum + (state.appStore.counts[environment]?.tracked || 0), 0);
    patch(slot(root, "gap"), callout({
      tone: "info",
      iconName: "link",
      title: "Paid subscriptions now come from Apple",
      body: `Apple has reported ${plural(tracked, "subscription")}${trackingSinceLabel() ? ` since ${trackingSinceLabel()}` : ""} through signed App Store Server Notifications. A subscriber shows up at their first App Store event after tracking began (purchase, renewal, billing problem, refund) or when they open an AI feature, so the Apple count is a lower bound until everyone has renewed once. A subscription links to a Firebase account only through its appAccountToken, never by guesswork.`
    }));
    return;
  }
  if (source === "waiting") {
    patch(slot(root, "gap"), callout({
      tone: "warn",
      iconName: "unlink",
      title: "No App Store notification has arrived yet",
      body: html`The backend endpoint is deployed, but Apple has not sent anything. In App Store Connect, open the app → App Information → App Store Server Notifications, set this URL as the Version 2 production and sandbox URL, then make a TestFlight (sandbox) purchase to confirm it. Until then only subscribers seen at an AI feature check are counted.${idChip(NOTIFICATION_URL, "Notification URL")}`
    }));
    return;
  }
  patch(slot(root, "gap"), callout({
    tone: "info",
    iconName: "unlink",
    title: "A paid App Store subscription can be missing from this page",
    body: `Usage records only exist once a subscriber makes an AI request. ${count ? `These ${plural(count, "subscription")} are the ones that used AI in ${monthLabel(state.dashboard?.periodKey)}.` : ""} ${source === "pending" ? "App Store subscription counts are loading." : "App Store subscription counts are unavailable, so anyone who subscribed but has not used AI this month is invisible here (see App Store source below)."} No Apple transaction is ever matched to a user by guesswork.`
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
  </tr>`.value).join("") : html`<tr><td colspan="6">${all.length ? emptyState({ iconName: "search", title: "No subscribers match", body: "Clear a filter or search for a different email, UID or hash.", action: html`<button class="btn btn-secondary btn-sm" type="button" data-filter-clear>Clear filters</button>` }) : emptyState({ iconName: "subscribers", title: "No subscriber has used AI this month", body: "Subscribers appear here after their first AI request of the billing period. Paid subscriptions without AI use are listed under App Store subscriptions." })}</td></tr>`);
  const signature = `${params.toString()}`;
  if (changed && lastSignature && signature !== lastSignature) animateRows(slot(root, "rows"));
  lastSignature = signature;
}

function accessBadge(row) {
  const [tone, label, tip] = ACCESS_BADGES[row.accessState] || ["muted", row.status || "Unknown", ""];
  return html`<span class="badge ${tone === "muted" ? "" : `badge-${tone}`}" data-tip="${tip}">${label}</span>`;
}

function appleLinkBadge(row) {
  if (row.link === "linked") {
    return html`<span class="badge badge-mint" data-tip="A signed-in session on the installation that bought this subscription was verified by Apple (appAccountToken)">${icon("link")}Linked</span>`;
  }
  if (row.link === "ambiguous") {
    return html`<span class="badge badge-warn" data-tip="Several Firebase accounts were verified on the installation that bought it, so none is attributed">Shared device</span>`;
  }
  return html`<span class="badge" data-tip="No signed-in session on the installation that bought it has been verified yet">${icon("unlink")}Unlinked</span>`;
}

function appleAccount(row) {
  if (row.link === "linked") return row.email || row.displayName || row.uid;
  return row.link === "ambiguous" ? "Shared installation" : "Unlinked subscriber";
}

function renewalLabel(row) {
  if (row.accessState === "grace" && row.gracePeriodExpiresDate) return `Grace until ${formatDay(row.gracePeriodExpiresDate)}`;
  if (!row.expiresDate) return "—";
  if (row.accessState === "active") return `${row.autoRenewStatus === false ? "Ends" : "Renews"} ${formatDay(row.expiresDate)}`;
  return `${Date.parse(row.expiresDate) < Date.now() ? "Expired" : "Expires"} ${formatDay(row.expiresDate)}`;
}

function renderAppleRows() {
  const source = appStoreSourceState();
  const view = appleView();
  root.querySelectorAll("[data-apple-view]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.appleView === view.id)));
  syncSegmented(slot(root, "appstore-view"));
  const body = slot(root, "appstore-rows");
  if (source === "pending") {
    patch(slot(root, "appstore-sub"), "Loading App Store data…");
    patch(slot(root, "appstore-foot"), "");
    patch(body, html`<tr><td colspan="6"><div style="display:grid;gap:10px;padding:12px 0">${Array.from({ length: 3 }, () => html`<span class="skeleton sk-row"></span>`)}</div></td></tr>`);
    return;
  }
  if (!state.appStore) {
    patch(slot(root, "appstore-sub"), "Not available");
    patch(slot(root, "appstore-foot"), "");
    patch(body, html`<tr><td colspan="6">${source === "not-deployed"
      ? emptyState({ iconName: "unlink", title: "App Store notifications are not deployed yet", body: "Deploy the functions build that adds soundframeAppStoreNotifications and soundframeAdminAppStoreSubscribers, then register the endpoint in App Store Connect." })
      : emptyState({ iconName: "alert", title: "App Store subscriptions could not be loaded", body: state.appStoreError?.message || "Try refreshing." })}</td></tr>`);
    return;
  }
  const rows = appleFiltered();
  const total = appStoreRows().length;
  patch(slot(root, "appstore-sub"), `${source === "live" ? "From Apple-signed notifications" : "From AI feature checks only (no notifications yet)"} · ${monthLabel(state.appStore.periodKey)} usage · updated ${timeAgo(state.appStore.generatedAt)}`);
  patch(slot(root, "appstore-foot"), html`<span>${number(rows.length)} shown of ${plural(total, "tracked subscription")}${state.appStore.rowsTruncated ? " · the list holds the first 500; counts include every subscription" : ""}${state.appStore.complete ? "" : " · counts hit the read limit and may be low"}</span><span>Sandbox rows are App Store test purchases.</span>`);
  patch(body, rows.length ? rows.map((row) => {
    const usage = findUser(row.subscriptionHash);
    return html`<tr data-stack${usage ? html` class="is-clickable" data-open-user="${row.subscriptionHash}" tabindex="0"` : ""}>
      <td><div class="cell-main"><strong>${appleAccount(row)}</strong><span class="cell-sub">${row.environment} · <span class="mono">${row.subscriptionHash.slice(0, 10)}…</span></span></div></td>
      <td data-label="Plan">${planLabel(row.productId)}</td>
      <td data-label="Status">${accessBadge(row)}</td>
      <td data-label="Link">${appleLinkBadge(row)}</td>
      <td data-label="AI this month">${row.aiUsageThisPeriod ? "Used AI" : html`<span class="faint">None</span>`}</td>
      <td data-label="Renewal">${renewalLabel(row)}</td>
    </tr>`.value;
  }).join("") : html`<tr><td colspan="6">${total
    ? emptyState({ iconName: "search", title: `Nothing in “${view.label}”`, body: "Choose another view or clear the search and plan filter.", compact: true })
    : emptyState({ iconName: "subscribers", title: "No App Store subscription reported yet", body: source === "live" ? "Apple has only sent notifications without a subscription (such as a test)." : "Subscriptions appear after Apple's first notification or a subscriber's first AI feature check." })}</td></tr>`);
}

function renderPlans() {
  const rows = users();
  const profit = state.finance?.profitability?.rows || [];
  const apple = state.appStore?.byPlan || null;
  const appleCount = (label) => (apple || []).filter((entry) => planLabel(entry.productId) === label).reduce((sum, entry) => sum + entry.Production, 0);
  const labels = [...PLAN_ORDER, ...(apple || []).map((entry) => planLabel(entry.productId)).filter((label) => !PLAN_ORDER.includes(label))];
  patch(slot(root, "plans-sub"), apple ? "Apple active subscriptions (production) · net price after Apple's cut" : state.finance ? "Visible subscribers · net price after Apple's cut" : "Visible subscribers");
  patch(slot(root, "plans"), Array.from(new Set(labels)).map((label) => {
    const count = rows.filter((user) => planLabel(user.subscriptionProductID) === label).length;
    const onApple = apple ? appleCount(label) : null;
    const row = profit.find((entry) => entry.label === label);
    if (!count && !onApple && !row?.payingSubscribers) return "";
    const price = row?.netMonthlyUSD !== null && row?.netMonthlyUSD !== undefined ? `${money(row.netMonthlyUSD, { cents: true })} net / month` : "Price not set";
    const side = apple
      ? html`<strong>${number(onApple)}</strong><span>${number(count)} used AI</span>`
      : html`<strong>${number(count)}</strong><span>${row?.revenueUSD !== null && row?.revenueUSD !== undefined ? `${money(row.revenueUSD, { cents: true })}/mo est.` : ""}</span>`;
    return html`<a class="list-row" href="${buildHash("subscribers", { plan: label })}"><span class="list-main"><strong>${label}</strong><span>${price}</span></span><span class="list-side">${side}</span></a>`.value;
  }).join("") || emptyState({ iconName: "subscribers", title: "No plans to show", compact: true }));
}

function renderSource() {
  const source = appStoreSourceState();
  const report = state.appStore;
  const endpoint = report?.endpoint;
  const production = appStoreCounts("Production");
  const badges = {
    live: toneBadge("ok", "Live"),
    waiting: toneBadge("warn", "Waiting for Apple"),
    "not-deployed": toneBadge("warn", "Backend not deployed"),
    error: toneBadge("crit", "Unavailable"),
    pending: toneBadge("muted", "Loading")
  };
  patch(slot(root, "source-badge"), badges[source]);
  const receive = source === "live"
    ? `Live. Apple's signed payloads are verified against Apple Root CA - G3 before anything is stored. Last: ${endpoint.lastNotificationType || "notification"} (${endpoint.lastEnvironment || "unknown"}) ${timeAgo(endpoint.lastReceivedAt)}.`
    : source === "waiting"
      ? html`Deployed, nothing received. Set ${idChip(NOTIFICATION_URL, "Notification URL")} as the Version 2 URL in App Store Connect (production and sandbox), then confirm with a TestFlight (sandbox) purchase.`
      : source === "not-deployed" ? "Not deployed. Deploy Functions to add soundframeAppStoreNotifications." : "Status unknown until the App Store source loads.";
  const link = production
    ? `${number(production.linked)} linked, ${number(production.unlinked)} unlinked${production.ambiguous ? `, ${number(production.ambiguous)} on a shared device` : ""} among paying production subscriptions. A link needs an Apple-verified transaction whose appAccountToken is the signed-in installation.`
    : "A subscription links to a Firebase account only when an Apple-verified transaction's appAccountToken matches the signed-in installation.";
  patch(slot(root, "source-steps"), html`
    <li><strong>Receive App Store Server Notifications V2</strong>${receive}</li>
    <li><strong>Link by appAccountToken, never by guess</strong>${link}</li>
    <li><strong>Existing subscribers fill in over one billing cycle</strong>Apple has no list-every-subscriber API. Each one appears at their next App Store event (within a month for monthly plans, three months for 3-month, a year for legacy annual) or when they open an AI feature.</li>
    <li><strong>Reconcile with App Store Connect</strong>Compare the production count with Sales and Trends → Subscriptions monthly. A gap usually means subscribers who have not renewed since tracking began.</li>`);
  if (!report) {
    patch(slot(root, "source-facts"), "");
    return;
  }
  const missed = APP_STORE_ENVIRONMENTS.reduce((sum, environment) => sum + (report.counts[environment]?.unconfirmed || 0), 0);
  const sandbox = appStoreCounts("Sandbox");
  patch(slot(root, "source-facts"), html`
    <div><dt>Notifications received</dt><dd>${number(endpoint.receivedCount)}${endpoint.lastReceivedAt ? ` · last ${formatDateTime(endpoint.lastReceivedAt)}` : ""}</dd></div>
    <div><dt>Last test notification</dt><dd>${endpoint.lastTestAt ? formatDateTime(endpoint.lastTestAt) : "None yet"}</dd></div>
    <div><dt>Rejected requests</dt><dd>${number(endpoint.rejectedCount)}${endpoint.lastRejectedAt ? ` · last ${timeAgo(endpoint.lastRejectedAt)} (${endpoint.lastRejectedReason || "unknown"})` : ""}</dd></div>
    <div><dt>Tracking since</dt><dd>${trackingSinceLabel() || "No subscription yet"}</dd></div>
    <div><dt>Missed renewal notices</dt><dd>${number(missed)}</dd></div>
    <div><dt>Ended (production)</dt><dd>${number(production.expired)} expired · ${number(production.refunded)} refunded · ${number(production.revoked)} revoked</dd></div>
    <div><dt>Sandbox</dt><dd>${number(sandbox.entitled)} active of ${number(sandbox.tracked)} tracked</dd></div>
    <div><dt>Counts generated</dt><dd>${formatDateTime(report.generatedAt)}</dd></div>`);
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
  const apple = findAppStoreSubscription(hash);
  const linkText = apple?.link === "linked" ? "linked" : apple?.link === "ambiguous" ? "shared device" : "not linked";
  const appleSummary = apple ? `App Store: ${ACCESS_BADGES[apple.accessState]?.[1] || apple.status} · ${planLabel(apple.productId)} · ${apple.environment} · ${renewalLabel(apple).replace(/^\w/, (letter) => letter.toLowerCase())} · ${linkText}.` : "";
  if (user) {
    patch(result, callout({ tone: "ok", iconName: "link", title: `Linked to ${accountLabel(user)}`, body: `${planLabel(user.subscriptionProductID)} · ${number(user.creditsUsed)} credits this month.${appleSummary ? ` ${appleSummary}` : ""}`, action: html`<button class="btn btn-secondary btn-sm" type="button" data-open-user="${user.quotaSubjectHash}">Open</button>` }));
    return;
  }
  if (apple) {
    patch(result, callout({ tone: apple.accessState === "active" ? "ok" : "info", iconName: apple.link === "linked" ? "link" : "unlink", title: apple.link === "linked" ? `${appleAccount(apple)} · no AI use this month` : "Known to Apple · no AI use this month", body: appleSummary }));
    return;
  }
  const appleKnown = Boolean(state.appStore);
  patch(result, callout({ tone: "info", iconName: "unlink", title: "No match", body: `No usage record matches${appleKnown ? ", and Apple has not reported this subscription since tracking began" : ""}. ${appleKnown ? "It may not have renewed yet, " : `It has not made an AI request in ${monthLabel(state.dashboard?.periodKey)}, `}or the ID is wrong.${state.appStore?.rowsTruncated ? " (The App Store list holds the first 500 subscriptions.)" : ""} This is not evidence that it is unpaid.` }));
}

function exportCSV() {
  const rows = filtered().map((user) => [
    accountLabel(user), user.uid, user.quotaSubjectHash, planLabel(user.subscriptionProductID),
    subscriptionSource(user) === "internal-test" ? "internal-test" : "linked", authProviderLabel(user.authProvider),
    user.creditsUsed, user.providerCostUSD, user.updatedAt
  ]);
  downloadCSV(`soundframe-subscribers-${state.dashboard?.periodKey || "current"}.csv`, ["account", "uid", "subscriptionHash", "plan", "link", "signIn", "creditsUsed", "providerCostUSD", "lastActivity"], rows);
}

function exportAppleCSV() {
  const rows = appleFiltered().map((row) => [
    row.subscriptionHash, planLabel(row.productId), row.productId, row.environment, row.status, row.accessState, row.link, row.uid, row.email,
    row.aiUsageThisPeriod ? "yes" : "no", row.expiresDate, row.gracePeriodExpiresDate, row.autoRenewStatus === null ? "" : String(row.autoRenewStatus),
    row.lastNotificationType, row.source, row.updatedAt
  ]);
  downloadCSV(`soundframe-app-store-subscriptions-${appleView().id}.csv`,
    ["subscriptionHash", "plan", "productId", "environment", "status", "access", "link", "uid", "email", "aiThisMonth", "expiresDate", "graceUntil", "autoRenew", "lastNotification", "source", "updatedAt"], rows);
}

function selectAppleView(id) {
  const params = new URLSearchParams(state.route.params);
  if (id === APPLE_VIEWS[0].id) params.delete("apple");
  else params.set("apple", id);
  navigate("subscribers", params, { replace: true });
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
      const view = event.target.closest("[data-apple-view]");
      if (view) selectAppleView(view.dataset.appleView);
      if (event.target.closest("[data-export-subs]")) exportCSV();
      if (event.target.closest("[data-export-apple]")) exportAppleCSV();
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
    const live = appStoreSourceState() === "live";
    patch(slot(root, "meta"), html`<span>Billing period ${monthLabel(state.dashboard?.periodKey || state.finance?.periodKey)}</span><span class="faint">·</span><span>${live ? `App Store notifications${trackingSinceLabel() ? ` since ${trackingSinceLabel()}` : ""} · links by appAccountToken only` : "Apple-verified at each AI request · App Store notifications not connected"}</span>`);
    renderGap();
    renderStrip();
    renderRows();
    renderAppleRows();
    renderPlans();
    renderSource();
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
