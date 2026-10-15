// Boot: auth, refresh policy, page lifecycle, gates and global wiring.
import { state, prefs, on, emit, savePrefs } from "./store.js";
import { watchAuth, signInGoogle, signInAnon, signOutAdmin, api, describeError } from "./api.js";
import { initRouter, startRouter, navigate, routeTitle } from "./router.js";
import { initShell, renderBadges, renderNotifications, renderFreshness, renderProfile } from "./shell.js";
import { initPopovers } from "./popover.js";
import { initTooltips, initCopyButtons, toast, patch, icon, idChip, prefersReducedMotion, $ } from "./ui.js";
import { html } from "./format.js";
import { initChartTheme, resizeCharts } from "./charts.js";
import { initDrawer, isDrawerOpen } from "./drawer.js";
import { initPalette, registerActions } from "./palette.js";
import { initDialogs, isEditing, openFinanceSettings } from "./dialogs.js";
import { buildNotifications } from "./data.js";
import { credential } from "./data.js";
import { PROVIDER_NAMES } from "./format.js";
import overview from "./pages/overview.js";
import finance from "./pages/finance.js";
import subscribers from "./pages/subscribers.js";
import users from "./pages/users.js";
import operations from "./pages/operations.js";
import events from "./pages/events.js";
import providers from "./pages/providers.js";
import audit from "./pages/audit.js";
import access from "./pages/access.js";
import settings from "./pages/settings.js";

const AUTO_REFRESH_MS = 45000;
// The provider monitor reads months of generation events, so it refreshes far less often than the dashboard:
// on first load, on manual refresh, and at most every 10 minutes while a finance-heavy page is open.
const FINANCE_REFRESH_MS = 10 * 60 * 1000;
const FINANCE_PAGES = new Set(["finance", "providers", "operations"]);
// App Store subscriber counts scan every tracked subscription, so they load on sign-in, on manual refresh and at most
// every 5 minutes while the Subscribers page is open: never on the 45-second dashboard poll.
const APP_STORE_REFRESH_MS = 5 * 60 * 1000;

const pages = { overview, finance, subscribers, users, operations, events, providers, audit, access, settings };
const mounted = new Set();
const dirty = new Set(Object.keys(pages));
let visiblePage = null;

const el = {
  app: $("#app"),
  gate: $("#gate"),
  pages: $("#pages"),
  main: $("#main")
};

// ---------- Page lifecycle ----------
function pageElement(name) {
  return document.getElementById(`page-${name}`);
}

function updatePage(name, context = {}) {
  const page = pages[name];
  if (!page) return;
  if (!mounted.has(name)) {
    page.mount(pageElement(name));
    mounted.add(name);
  }
  try {
    page.update(context);
  } catch (error) {
    console.error(`Rendering ${name} failed`, error);
  }
  dirty.delete(name);
}

function showPage(name, { initial = false } = {}) {
  const changed = visiblePage !== name;
  Object.keys(pages).forEach((key) => {
    const element = pageElement(key);
    if (key === name) {
      element.hidden = false;
    } else if (!element.hidden) {
      element.hidden = true;
      element.classList.remove("is-entering");
    }
  });
  visiblePage = name;
  document.title = `${routeTitle(name)} · SoundFrame Admin`;
  updatePage(name, { routeChanged: changed });
  if (changed && !initial) {
    const element = pageElement(name);
    element.classList.remove("is-entering");
    void element.offsetWidth;
    element.classList.add("is-entering");
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    const heading = element.querySelector("h1");
    if (heading && document.activeElement?.closest(".sidebar, .palette, .notif-panel")) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
}

function onData() {
  const notifications = buildNotifications();
  renderBadges(notifications);
  renderNotifications(notifications);
  Object.keys(pages).forEach((name) => dirty.add(name));
  if (state.auth === "ready" && visiblePage) updatePage(visiblePage);
}

// ---------- Gates ----------
function setAuth(mode) {
  state.auth = mode;
  el.app.dataset.auth = mode;
  renderGate();
  renderFreshness();
  renderProfile();
}

function renderGate() {
  const mode = state.auth;
  const showGate = mode === "signedout" || mode === "locked" || (mode === "error" && !state.dashboard);
  el.gate.classList.toggle("hidden", !showGate);
  el.pages.hidden = showGate;
  if (!showGate) {
    patch(el.gate, "");
    return;
  }
  if (mode === "signedout") {
    patch(el.gate, html`<div class="gate-card">
      <img class="gate-logo" src="./assets/soundframe-logo-128.png" width="56" height="56" alt="">
      <p class="eyebrow">SoundFrame Admin</p>
      <h1>Sign in to the <span class="headline-gradient">command center</span></h1>
      <p class="muted">Use a Google account for an auditable admin identity. Anonymous sign-in only works on devices that are already allow-listed.</p>
      <div class="gate-actions">
        <button class="btn btn-primary" type="button" data-gate="google">Sign in with Google</button>
        <button class="btn btn-secondary" type="button" data-gate="anon">Continue anonymously</button>
      </div>
      <p class="faint gate-foot">${icon("audit")}Access is checked server-side on every request. This page holds no secrets.</p>
    </div>`);
    return;
  }
  if (mode === "locked") {
    const uid = state.status?.uid || state.user?.uid || "PASTE_UID_HERE";
    const command = [
      "cd ~/Documents/GitHub/soundframe-ios",
      "open -e functions/.env.soundframe-1b8d4",
      "",
      "# Add this line, or edit the existing SOUNDFRAME_ADMIN_UIDS line:",
      `SOUNDFRAME_ADMIN_UIDS=${uid}`,
      "",
      "npm --prefix functions run build",
      "firebase deploy --only functions --project soundframe-1b8d4"
    ].join("\n");
    patch(el.gate, html`<div class="gate-card gate-wide">
      <span class="gate-icon" data-tone="warn">${icon("access", "icon-lg")}</span>
      <p class="eyebrow">Access required</p>
      <h1>This account is not a SoundFrame admin yet</h1>
      <p class="muted">Signed in as ${state.user?.email || (state.user?.isAnonymous ? "an anonymous device" : "a Firebase user")}. Add the UID below to <code>SOUNDFRAME_ADMIN_UIDS</code> in the Functions environment, deploy Functions, then refresh.</p>
      <div class="gate-uid">${idChip(uid, "UID")}</div>
      <div class="code-block"><pre><code>${command}</code></pre><button class="btn btn-secondary btn-sm" type="button" data-copy="${command}" data-copy-label="Setup commands">${icon("copy")}Copy</button></div>
      <div class="gate-actions"><button class="btn btn-secondary" type="button" data-gate="retry">${icon("refresh")}Check again</button><button class="btn btn-ghost" type="button" data-gate="signout">Sign out</button></div>
    </div>`);
    return;
  }
  const error = state.dashboardError || state.authError;
  patch(el.gate, html`<div class="gate-card">
    <span class="gate-icon" data-tone="crit">${icon("alert", "icon-lg")}</span>
    <p class="eyebrow">${error?.kind === "network" ? "Network error" : error?.kind === "permission" ? "Permission denied" : "Firebase error"}</p>
    <h1>Couldn't load the dashboard</h1>
    <p class="muted">${error?.message || "Something went wrong while contacting Firebase."}</p>
    <div class="gate-actions"><button class="btn btn-primary" type="button" data-gate="retry">${icon("refresh")}Try again</button><button class="btn btn-ghost" type="button" data-gate="signout">Sign out</button></div>
  </div>`);
}

// ---------- Data loading ----------
function financeIsStale() {
  if (state.financeLoading) return false;
  if (!state.financeLoadedAt) return true;
  return FINANCE_PAGES.has(state.route.name) && Date.now() - state.financeLoadedAt > FINANCE_REFRESH_MS;
}

async function loadFinance() {
  if (state.financeLoading || !state.user || state.auth !== "ready") return;
  state.financeLoading = true;
  renderFreshness();
  emit("data", { source: "finance-loading" });
  try {
    state.finance = await api.financeMonitor(state.user);
    state.financeError = null;
  } catch (error) {
    state.financeError = describeError(error);
    if (state.finance) toast(`Provider figures could not be refreshed. ${state.financeError.message}`, "warn");
  } finally {
    state.financeLoadedAt = Date.now();
    state.financeLoading = false;
    renderFreshness();
    emit("data", { source: "finance" });
  }
}

function appStoreIsStale() {
  if (state.appStoreLoading) return false;
  if (!state.appStoreLoadedAt) return true;
  return state.route.name === "subscribers" && Date.now() - state.appStoreLoadedAt > APP_STORE_REFRESH_MS;
}

async function loadAppStore() {
  if (state.appStoreLoading || !state.user || state.auth !== "ready") return;
  state.appStoreLoading = true;
  try {
    state.appStore = await api.appStoreSubscribers(state.user);
    state.appStoreError = null;
  } catch (error) {
    state.appStoreError = describeError(error);
    if (state.appStore) toast(`App Store subscriber counts could not be refreshed. ${state.appStoreError.message}`, "warn");
  } finally {
    state.appStoreLoadedAt = Date.now();
    state.appStoreLoading = false;
    emit("data", { source: "appStore" });
  }
}

async function refresh({ force = false } = {}) {
  if (!state.user || state.loading) return;
  state.loading = true;
  renderFreshness();
  try {
    state.status = await api.status(state.user);
    if (!state.status.isAdmin) {
      state.dashboard = null;
      state.finance = null;
      state.appStore = null;
      setAuth("locked");
      return;
    }
    if (state.auth !== "ready") setAuth("ready");
    state.dashboard = await api.dashboard(state.user);
    state.dashboardLoadedAt = Date.now();
    state.dashboardError = null;
    state.lastRefreshFailed = false;
    renderGate();
    emit("data", { source: "dashboard" });
    if (force || financeIsStale()) loadFinance();
    if (force || appStoreIsStale()) loadAppStore();
  } catch (error) {
    const info = describeError(error);
    state.dashboardError = info;
    state.lastRefreshFailed = true;
    if (!state.dashboard) setAuth(state.status?.isAdmin ? "error" : "error");
    else toast(`Refresh failed — showing the last loaded data. ${info.message}`, "warn");
    emit("data", { source: "error" });
  } finally {
    state.loading = false;
    renderFreshness();
  }
}

function maybeAutoRefresh() {
  if (!prefs.autoRefresh || state.loading || document.visibilityState !== "visible") return;
  if (!state.user || state.auth !== "ready") return;
  // Never refresh underneath a form the admin is editing.
  if (isEditing()) return;
  refresh();
}

async function syncFinance(button) {
  if (!state.user || !state.finance) return;
  const buttons = Array.from(document.querySelectorAll("[data-finance-sync]"));
  buttons.forEach((entry) => {
    entry.disabled = true;
    entry.classList.add("is-busy");
    const label = entry.querySelector("span");
    if (label) label.textContent = "Syncing…";
  });
  try {
    state.finance = await api.financeSync(state.user);
    state.financeError = null;
    state.financeLoadedAt = Date.now();
    emit("data", { source: "finance" });
    const summary = state.finance.providers.map((card) => `${PROVIDER_NAMES[card.id]}: balance ${credential(card.sync.balanceStatus).label.toLowerCase()}, spend ${credential(card.sync.spendStatus).label.toLowerCase()}`).join(" · ");
    toast(`Billing sync finished. ${summary}`, "ok", { duration: 7000 });
  } catch (error) {
    toast(`Billing sync failed. ${describeError(error).message}`, "warn");
  } finally {
    buttons.forEach((entry) => {
      entry.disabled = !state.finance;
      entry.classList.remove("is-busy");
      const label = entry.querySelector("span");
      if (label) label.textContent = "Sync balances";
    });
  }
}

async function signOut() {
  try {
    await signOutAdmin();
  } catch (error) {
    toast(`Sign-out failed. ${describeError(error).message}`, "warn");
  }
}

// ---------- Wiring ----------
function initGateActions() {
  el.gate.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-gate]")?.dataset.gate;
    if (!action) return;
    if (action === "google") {
      try {
        await signInGoogle();
      } catch (error) {
        toast(`Google sign-in failed. ${describeError(error).message}`, "warn");
      }
    } else if (action === "anon") {
      try {
        await signInAnon();
      } catch (error) {
        toast(`Anonymous sign-in failed. Enable Anonymous Auth in Firebase Authentication. ${describeError(error).message}`, "warn");
      }
    } else if (action === "retry") {
      refresh({ force: true });
    } else if (action === "signout") {
      signOut();
    }
  });
}

function registerPaletteActions() {
  registerActions([
    { label: "Refresh data", hint: "⌘R", icon: "refresh", keywords: "reload update", run: () => refresh({ force: true }) },
    { label: "Sync provider balances", icon: "wallet", keywords: "billing byteplus openai google", run: () => syncFinance() },
    { label: "Open finance settings", icon: "settings", keywords: "thresholds manual balances prices commission", run: () => openFinanceSettings() },
    { label: "Toggle sidebar", hint: "[", icon: "sidebar", keywords: "collapse expand rail", run: () => document.getElementById("collapseButton").click() },
    { label: prefs.compare ? "Stop comparing periods" : "Compare with previous period", icon: "compare", keywords: "delta compare", run: () => savePrefs({ compare: !prefs.compare }) },
    { label: prefs.autoRefresh ? "Turn auto-refresh off" : "Turn auto-refresh on", icon: "clock", keywords: "auto refresh polling", run: () => savePrefs({ autoRefresh: !prefs.autoRefresh }) },
    { label: "Export users (CSV)", icon: "download", keywords: "csv download quota", run: () => users.exportCSV?.() },
    { label: "Export events (CSV)", icon: "download", keywords: "csv download ledger", run: () => events.exportCSV?.() },
    { label: "Users over their limit", icon: "users", keywords: "risk blocked quota", run: () => navigate("users", { status: "over" }) },
    { label: "Copy admin UID", icon: "copy", keywords: "uid identity", run: () => navigator.clipboard?.writeText(state.status?.uid || state.user?.uid || "").then(() => toast("Admin UID copied to the clipboard.", "ok")) },
    { label: "Sign out", icon: "logout", keywords: "logout", run: () => signOut() }
  ]);
}

function boot() {
  initChartTheme();
  initTooltips();
  initCopyButtons();
  initPopovers();
  initRouter();
  initDialogs();
  initDrawer();
  initPalette();
  initShell({ refresh, signOut });
  initGateActions();
  finance.configure({ sync: syncFinance, reloadFinance: () => loadFinance() });
  providers.configure({ sync: syncFinance, reloadFinance: () => loadFinance() });
  operations.configure?.({ reloadFinance: () => loadFinance() });
  registerPaletteActions();

  on("route", ({ current, paramsOnly, initial }) => {
    if (paramsOnly && visiblePage === current.name) updatePage(current.name);
    else showPage(current.name, { initial });
    if (state.auth === "ready" && financeIsStale() && !state.loading) loadFinance();
    if (state.auth === "ready" && appStoreIsStale() && !state.loading) loadAppStore();
  });
  on("data", onData);
  on("prefs", (patchPrefs) => {
    registerPaletteActions();
    if (["range", "compare", "customFrom", "customTo"].some((key) => key in patchPrefs)) {
      Object.keys(pages).forEach((name) => dirty.add(name));
      if (visiblePage && state.auth !== "signedout") updatePage(visiblePage);
    }
    if ("autoRefresh" in patchPrefs && prefs.autoRefresh) maybeAutoRefresh();
  });
  on("layout", resizeCharts);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") maybeAutoRefresh();
  });
  setInterval(maybeAutoRefresh, AUTO_REFRESH_MS);

  startRouter();
  watchAuth(async (user) => {
    state.user = user;
    if (!user) {
      state.status = null;
      state.dashboard = null;
      state.finance = null;
      state.financeError = null;
      state.financeLoadedAt = 0;
      state.appStore = null;
      state.appStoreError = null;
      state.appStoreLoadedAt = 0;
      setAuth("signedout");
      onData();
      return;
    }
    setAuth("booting");
    await refresh({ force: true });
  });

  // Exposed for the console only (same as the previous dashboard).
  window.soundframeAdminSignOut = signOut;
}

boot();

export { isDrawerOpen, prefersReducedMotion };
