import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

const firebaseConfig = {
  projectId: "soundframe-1b8d4",
  appId: "1:738680654271:web:591e3f4e364626656eb90a",
  storageBucket: "soundframe-1b8d4.firebasestorage.app",
  apiKey: "AIzaSyDyL-KQ4AzCPy_TumcgdEW6M9BGlsVuwqY",
  authDomain: "soundframe-1b8d4.firebaseapp.com",
  messagingSenderId: "738680654271",
  measurementId: "G-W60KKZCNER"
};

const AUTO_REFRESH_MS = 45000;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west1");
const googleProvider = new GoogleAuthProvider();

const statusCallable = httpsCallable(functions, "soundframeAdminStatus");
const dashboardCallable = httpsCallable(functions, "soundframeAdminDashboard");
const updateLimitsCallable = httpsCallable(functions, "soundframeAdminUpdateUserLimits");

const state = {
  user: null,
  status: null,
  dashboard: null,
  selectedUser: null,
  activeView: viewFromHash(),
  search: "",
  sort: { key: "cost", dir: "desc" },
  eventSearch: "",
  eventProvider: "",
  eventKind: "",
  autoRefresh: true,
  chart: null,
  planChart: null,
  featureChart: null,
  loading: false,
  toastTimer: null
};

const CHART_PALETTE = ["#37d4df", "#d9a24a", "#8f7bff", "#43d18b", "#ff647c", "#5ce6cf", "#ffc46b", "#6ea8ff"];

const el = {
  navLinks: Array.from(document.querySelectorAll("[data-view-link]")),
  viewSections: Array.from(document.querySelectorAll("[data-view-section]")),
  statusPanel: document.getElementById("statusPanel"),
  statusLabel: document.getElementById("statusLabel"),
  statusText: document.getElementById("statusText"),
  uidText: document.getElementById("uidText"),
  freshness: document.getElementById("freshness"),
  autoRefreshButton: document.getElementById("autoRefreshButton"),
  copyUidButton: document.getElementById("copyUidButton"),
  signOutButton: document.getElementById("signOutButton"),
  refreshButton: document.getElementById("refreshButton"),
  signInPanel: document.getElementById("signInPanel"),
  googleSignInButton: document.getElementById("googleSignInButton"),
  anonSignInButton: document.getElementById("anonSignInButton"),
  setupPanel: document.getElementById("setupPanel"),
  setupCommand: document.getElementById("setupCommand"),
  dashboard: document.getElementById("dashboard"),
  activeUsers: document.getElementById("activeUsers"),
  usageRecords: document.getElementById("usageRecords"),
  videoClips: document.getElementById("videoClips"),
  creditsUsed: document.getElementById("creditsUsed"),
  providerCost: document.getElementById("providerCost"),
  activeOverrides: document.getElementById("activeOverrides"),
  periodText: document.getElementById("periodText"),
  chartWindowLabel: document.getElementById("chartWindowLabel"),
  costWindowLabel: document.getElementById("costWindowLabel"),
  usageChart: document.getElementById("usageChart"),
  chartRequests: document.getElementById("chartRequests"),
  chartVideos: document.getElementById("chartVideos"),
  chartCost: document.getElementById("chartCost"),
  costByModelTable: document.getElementById("costByModelTable"),
  atRiskCount: document.getElementById("atRiskCount"),
  atRiskDetail: document.getElementById("atRiskDetail"),
  atRiskTile: document.getElementById("atRiskTile"),
  avgCost: document.getElementById("avgCost"),
  avgCredits: document.getElementById("avgCredits"),
  avgRequests: document.getElementById("avgRequests"),
  overrideActive: document.getElementById("overrideActive"),
  overridePaused: document.getElementById("overridePaused"),
  planMixChart: document.getElementById("planMixChart"),
  planMixLegend: document.getElementById("planMixLegend"),
  featureUsageChart: document.getElementById("featureUsageChart"),
  featureUsageLegend: document.getElementById("featureUsageLegend"),
  providerSplit: document.getElementById("providerSplit"),
  providerWindowLabel: document.getElementById("providerWindowLabel"),
  topSpenders: document.getElementById("topSpenders"),
  accessProvider: document.getElementById("accessProvider"),
  accessWindow: document.getElementById("accessWindow"),
  accessPeriod: document.getElementById("accessPeriod"),
  accessRefreshed: document.getElementById("accessRefreshed"),
  eventsList: document.getElementById("eventsList"),
  eventsListFull: document.getElementById("eventsListFull"),
  eventSearch: document.getElementById("eventSearch"),
  eventProvider: document.getElementById("eventProvider"),
  eventKind: document.getElementById("eventKind"),
  exportEventsButton: document.getElementById("exportEventsButton"),
  auditList: document.getElementById("auditList"),
  accessUID: document.getElementById("accessUID"),
  accessStatus: document.getElementById("accessStatus"),
  accessIdentity: document.getElementById("accessIdentity"),
  usersTable: document.getElementById("usersTable"),
  userSearch: document.getElementById("userSearch"),
  exportUsersButton: document.getElementById("exportUsersButton"),
  sortHeaders: Array.from(document.querySelectorAll(".sort-th")),
  limitDialog: document.getElementById("limitDialog"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogEmail: document.getElementById("dialogEmail"),
  dialogUID: document.getElementById("dialogUID"),
  dialogHash: document.getElementById("dialogHash"),
  dialogPlan: document.getElementById("dialogPlan"),
  videoLimitInput: document.getElementById("videoLimitInput"),
  clearVideoLimitInput: document.getElementById("clearVideoLimitInput"),
  creditLimitInput: document.getElementById("creditLimitInput"),
  clearCreditLimitInput: document.getElementById("clearCreditLimitInput"),
  noteInput: document.getElementById("noteInput"),
  disabledInput: document.getElementById("disabledInput"),
  dialogError: document.getElementById("dialogError"),
  saveLimitsButton: document.getElementById("saveLimitsButton"),
  userDialog: document.getElementById("userDialog"),
  userDialogTitle: document.getElementById("userDialogTitle"),
  userDialogIdentity: document.getElementById("userDialogIdentity"),
  userDialogUsage: document.getElementById("userDialogUsage"),
  userDialogEvents: document.getElementById("userDialogEvents"),
  userDialogEditButton: document.getElementById("userDialogEditButton"),
  userDialogCloseButton: document.getElementById("userDialogCloseButton"),
  closeUserDialogButton: document.getElementById("closeUserDialogButton"),
  toast: document.getElementById("toast")
};

el.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.viewLink || "overview", true);
  });
});
el.refreshButton.addEventListener("click", () => refresh());
el.autoRefreshButton.addEventListener("click", toggleAutoRefresh);
el.copyUidButton.addEventListener("click", copyUID);
el.signOutButton.addEventListener("click", () => signOut(auth));
el.googleSignInButton.addEventListener("click", signInWithGoogle);
el.anonSignInButton.addEventListener("click", continueAnonymously);
el.userSearch.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  renderUsers();
});
el.exportUsersButton.addEventListener("click", exportUsersCSV);
el.exportEventsButton.addEventListener("click", exportEventsCSV);
el.eventSearch.addEventListener("input", (event) => {
  state.eventSearch = event.target.value.trim().toLowerCase();
  renderEventsFull();
});
el.eventProvider.addEventListener("change", (event) => {
  state.eventProvider = event.target.value;
  renderEventsFull();
});
el.eventKind.addEventListener("change", (event) => {
  state.eventKind = event.target.value;
  renderEventsFull();
});
el.sortHeaders.forEach((header) => {
  header.addEventListener("click", () => applySort(header.dataset.sort));
});
el.usersTable.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-user]");
  const detailButton = event.target.closest("[data-detail-user]");
  const target = editButton || detailButton;
  if (!target || !state.dashboard) {
    return;
  }
  const hash = target.dataset.editUser || target.dataset.detailUser;
  const user = state.dashboard.users.find((candidate) => candidate.quotaSubjectHash === hash);
  if (!user) {
    return;
  }
  if (editButton) {
    openLimitDialog(user);
  } else {
    openUserDetail(user);
  }
});
el.topSpenders.addEventListener("click", activateTopSpender);
el.topSpenders.addEventListener("keydown", activateTopSpender);
el.saveLimitsButton.addEventListener("click", saveLimits);
el.closeUserDialogButton.addEventListener("click", () => el.userDialog.close());
el.userDialogCloseButton.addEventListener("click", () => el.userDialog.close());
el.userDialogEditButton.addEventListener("click", () => {
  const user = state.selectedUser;
  el.userDialog.close();
  if (user) {
    openLimitDialog(user);
  }
});
window.addEventListener("hashchange", () => {
  setActiveView(viewFromHash(), false);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    maybeAutoRefresh();
  }
});

setInterval(maybeAutoRefresh, AUTO_REFRESH_MS);
setInterval(tickFreshness, 1000);

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    state.status = null;
    state.dashboard = null;
    showSignIn();
    return;
  }
  el.signInPanel.classList.add("hidden");
  el.signOutButton.classList.remove("hidden");
  await refresh();
});

function showSignIn() {
  el.signOutButton.classList.add("hidden");
  el.dashboard.classList.add("hidden");
  el.setupPanel.classList.add("hidden");
  el.freshness.classList.add("hidden");
  el.signInPanel.classList.remove("hidden");
  el.uidText.textContent = "Not signed in";
  setStatus("Signed out", "Choose how to authenticate to load the admin console.", "locked");
}

async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    showToast(`Google sign-in failed. ${errorMessage(error)}`, "warn");
  }
}

async function continueAnonymously() {
  try {
    await signInAnonymously(auth);
  } catch (error) {
    showToast(`Anonymous sign-in failed. Enable Anonymous Auth in Firebase Authentication. ${errorMessage(error)}`, "warn");
  }
}

async function refresh() {
  if (!state.user || state.loading) {
    return;
  }
  setLoading(true);
  try {
    const token = await state.user.getIdToken(true);
    const statusResult = await statusCallable({ authIDToken: token });
    state.status = statusResult.data;
    renderShell();

    if (!state.status.isAdmin) {
      state.dashboard = null;
      renderLocked();
      return;
    }

    const dashboardResult = await dashboardCallable({ authIDToken: token });
    state.dashboard = dashboardResult.data;
    renderDashboard();
  } catch (error) {
    showError(errorMessage(error));
  } finally {
    setLoading(false);
  }
}

function maybeAutoRefresh() {
  if (!state.autoRefresh || state.loading) {
    return;
  }
  if (document.visibilityState !== "visible") {
    return;
  }
  if (!state.user || !state.status?.isAdmin) {
    return;
  }
  if (el.limitDialog.open || el.userDialog.open) {
    return;
  }
  refresh();
}

function toggleAutoRefresh() {
  state.autoRefresh = !state.autoRefresh;
  el.autoRefreshButton.textContent = state.autoRefresh ? "Auto: on" : "Auto: off";
  el.autoRefreshButton.setAttribute("aria-pressed", String(state.autoRefresh));
  if (state.autoRefresh) {
    maybeAutoRefresh();
  }
}

function renderShell() {
  const uid = state.status?.uid || state.user?.uid || "";
  el.uidText.textContent = uid ? `UID ${uid}` : "UID pending";
  if (state.status?.isAdmin) {
    setStatus("Admin", "Authenticated with SoundFrame admin access.", "ready");
  } else {
    setStatus("Locked", "Signed in, but this UID has not been granted admin access.", "locked");
  }
}

function renderLocked() {
  const uid = state.status?.uid || state.user?.uid || "PASTE_UID_HERE";
  el.signInPanel.classList.add("hidden");
  el.dashboard.classList.add("hidden");
  el.freshness.classList.add("hidden");
  el.setupPanel.classList.remove("hidden");
  el.setupCommand.textContent = [
    "cd ~/Documents/GitHub/soundframe-ios",
    "open -e functions/.env.soundframe-1b8d4",
    "",
    "# Add this line, or edit the existing SOUNDFRAME_ADMIN_UIDS line:",
    `SOUNDFRAME_ADMIN_UIDS=${uid}`,
    "",
    "npm --prefix functions run build",
    "firebase deploy --only functions --project soundframe-1b8d4"
  ].join("\n");
}

function renderDashboard() {
  if (!state.dashboard) {
    return;
  }
  const stats = state.dashboard.stats;
  const windowDays = state.dashboard.eventWindowDays || 14;
  el.signInPanel.classList.add("hidden");
  el.setupPanel.classList.add("hidden");
  el.dashboard.classList.remove("hidden");
  el.freshness.classList.remove("hidden");
  el.chartWindowLabel.textContent = `Last ${windowDays} days`;
  el.costWindowLabel.textContent = `Last ${windowDays} days`;
  el.activeUsers.textContent = number(stats.activeUsers);
  el.usageRecords.textContent = `${number(stats.usageRecords)} usage records`;
  el.videoClips.textContent = number(stats.videoClipsUsed);
  el.creditsUsed.textContent = number(stats.creditsUsed);
  el.providerCost.textContent = money(stats.providerCostUSD);
  el.activeOverrides.textContent = `${number(stats.activeOverrides)} active overrides`;
  el.periodText.textContent = state.dashboard.periodKey || "Current period";
  el.chartRequests.textContent = number(stats.windowRequests);
  el.chartVideos.textContent = number(stats.windowVideos);
  el.chartCost.textContent = money(stats.windowProviderCostUSD);
  renderChart();
  renderInsights();
  renderPlanMix();
  renderFeatureUsage();
  renderProviderSplit();
  renderTopSpenders();
  renderCostByModel();
  populateEventFilters();
  renderEvents();
  renderEventsFull();
  renderUsers();
  renderAudit();
  renderAccess();
  tickFreshness();
  setActiveView(state.activeView, false);
}

function setActiveView(view, updateHash) {
  const nextView = ["overview", "users", "events", "audit", "access"].includes(view) ? view : "overview";
  state.activeView = nextView;
  el.navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.viewLink === nextView);
  });
  el.viewSections.forEach((section) => {
    section.classList.toggle("hidden", section.dataset.viewSection !== nextView);
  });
  if (updateHash && window.location.hash !== `#${nextView}`) {
    history.pushState(null, "", `#${nextView}`);
  }
  if (nextView === "overview") {
    requestAnimationFrame(() => {
      state.chart?.resize();
      state.planChart?.resize();
      state.featureChart?.resize();
    });
  }
}

function viewFromHash() {
  return (window.location.hash || "#overview").replace("#", "") || "overview";
}

function renderChart() {
  const rows = state.dashboard?.usageByDay || [];
  const labels = rows.map((row) => row.day.slice(5));
  const requestData = rows.map((row) => row.requests);
  const videoData = rows.map((row) => row.videos);
  const maxRequests = Math.max(6, ...requestData);
  const maxVideos = Math.max(3, ...videoData);
  if (state.chart) {
    state.chart.destroy();
  }
  const context = el.usageChart.getContext("2d");
  const requestFill = context.createLinearGradient(0, 0, 0, 220);
  requestFill.addColorStop(0, "rgba(55, 212, 223, 0.24)");
  requestFill.addColorStop(1, "rgba(55, 212, 223, 0.01)");
  state.chart = new Chart(el.usageChart, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          type: "line",
          label: "Requests",
          data: requestData,
          borderColor: "#37d4df",
          backgroundColor: requestFill,
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.28,
          yAxisID: "requests",
          order: 1
        },
        {
          label: "Videos",
          data: videoData,
          backgroundColor: "rgba(217, 162, 74, 0.82)",
          hoverBackgroundColor: "rgba(255, 196, 107, 0.95)",
          borderRadius: 8,
          borderSkipped: false,
          barThickness: 12,
          yAxisID: "videos",
          order: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: {
        intersect: false,
        mode: "index"
      },
      plugins: {
        legend: {
          align: "end",
          labels: {
            color: "#c4cad6",
            boxWidth: 8,
            boxHeight: 8,
            usePointStyle: true,
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: "rgba(7, 9, 13, 0.96)",
          borderColor: "rgba(230, 237, 245, 0.14)",
          borderWidth: 1,
          displayColors: true,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: "#8f99aa",
            maxRotation: 0,
            autoSkipPadding: 18
          }
        },
        requests: {
          beginAtZero: true,
          suggestedMax: maxRequests + Math.ceil(maxRequests * 0.12),
          grid: { color: "rgba(230,237,245,0.07)" },
          border: { display: false },
          ticks: {
            color: "#8f99aa",
            precision: 0,
            maxTicksLimit: 4
          }
        },
        videos: {
          beginAtZero: true,
          position: "right",
          suggestedMax: maxVideos + 1,
          display: false,
          grid: { display: false }
        }
      }
    }
  });
}

function renderCostByModel() {
  const rows = state.dashboard?.costByModel || [];
  if (rows.length === 0) {
    el.costByModelTable.innerHTML = `<tr><td colspan="5" class="empty-state">No provider spend in this window yet.</td></tr>`;
    return;
  }
  const maxCost = Math.max(...rows.map((row) => row.providerCostUSD), 0.0001);
  el.costByModelTable.innerHTML = rows.map((row) => {
    const share = Math.min(100, Math.max(2, Math.round((row.providerCostUSD / maxCost) * 100)));
    return `
      <tr>
        <td>
          <div class="model-cell">
            <strong>${escapeHTML(row.model || "unknown")}</strong>
            <span class="identity-meta">${escapeHTML(row.provider || "unknown")}</span>
          </div>
        </td>
        <td>${number(row.requests)}</td>
        <td>${number(row.credits)}</td>
        <td>${money(row.providerCostUSD)}</td>
        <td>
          <span class="meter-track"><span class="meter-fill" style="width: ${share}%"></span></span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderInsights() {
  const stats = state.dashboard?.stats || {};
  const users = state.dashboard?.users || [];
  const windowDays = state.dashboard?.eventWindowDays || 14;
  const activeUsers = Math.max(1, stats.activeUsers || 0);

  const atRisk = users.filter((user) => riskLevel(user) !== "ok");
  const over = users.filter((user) => riskLevel(user) === "over");
  el.atRiskCount.textContent = number(atRisk.length);
  el.atRiskDetail.textContent = `${number(over.length)} over limit`;
  el.atRiskTile.classList.toggle("tile-danger", over.length > 0);
  el.atRiskTile.classList.toggle("tile-warn", over.length === 0 && atRisk.length > 0);

  el.avgCost.textContent = money((stats.providerCostUSD || 0) / activeUsers);
  el.avgCredits.textContent = `${number(Math.round((stats.creditsUsed || 0) / activeUsers))} credits each`;
  el.avgRequests.textContent = number(Math.round((stats.windowRequests || 0) / windowDays));

  const paused = users.filter((user) => user.override && user.override.disabled).length;
  el.overrideActive.textContent = number(stats.activeOverrides || 0);
  el.overridePaused.textContent = `${number(paused)} paused`;
}

function renderDoughnut(existing, canvas, legendEl, entries, formatValue) {
  if (existing) {
    existing.destroy();
  }
  const filtered = entries.filter((entry) => entry.value > 0);
  if (filtered.length === 0) {
    legendEl.innerHTML = `<div class="empty-state">No data in this window yet.</div>`;
    return null;
  }
  const colors = filtered.map((_, index) => CHART_PALETTE[index % CHART_PALETTE.length]);
  const total = filtered.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const chart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: filtered.map((entry) => entry.label),
      datasets: [{
        data: filtered.map((entry) => entry.value),
        backgroundColor: colors,
        borderColor: "rgba(7, 9, 13, 0.9)",
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: "62%",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(7, 9, 13, 0.96)",
          borderColor: "rgba(230, 237, 245, 0.14)",
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: (context) => ` ${context.label}: ${formatValue(context.parsed)} (${Math.round((context.parsed / total) * 100)}%)`
          }
        }
      }
    }
  });
  legendEl.innerHTML = filtered.map((entry, index) => `
    <span class="legend-item">
      <span class="legend-dot" style="background:${colors[index]}"></span>
      ${escapeHTML(entry.label)} <strong>${escapeHTML(formatValue(entry.value))}</strong>
    </span>
  `).join("");
  return chart;
}

function renderPlanMix() {
  const users = state.dashboard?.users || [];
  const counts = new Map();
  users.forEach((user) => {
    const label = planLabel(user.subscriptionProductID);
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const entries = Array.from(counts, ([label, value]) => ({ label, value }))
    .sort((lhs, rhs) => rhs.value - lhs.value);
  state.planChart = renderDoughnut(state.planChart, el.planMixChart, el.planMixLegend, entries, (value) => number(value));
}

function renderFeatureUsage() {
  const users = state.dashboard?.users || [];
  const total = (key) => users.reduce((sum, user) => sum + (Number(user[key]) || 0), 0);
  const entries = [
    { label: "Text", value: total("textUsed") },
    { label: "Images", value: total("imageUsed") },
    { label: "Video", value: total("videoUsed") },
    { label: "Captions", value: total("captionUsed") }
  ];
  state.featureChart = renderDoughnut(state.featureChart, el.featureUsageChart, el.featureUsageLegend, entries, (value) => number(value));
}

function renderProviderSplit() {
  const rows = state.dashboard?.costByModel || [];
  const byProvider = new Map();
  rows.forEach((row) => {
    const key = row.provider || "unknown";
    const entry = byProvider.get(key) || { provider: key, cost: 0, requests: 0 };
    entry.cost += Number(row.providerCostUSD) || 0;
    entry.requests += Number(row.requests) || 0;
    byProvider.set(key, entry);
  });
  const entries = Array.from(byProvider.values()).sort((lhs, rhs) => rhs.cost - lhs.cost);
  if (entries.length === 0) {
    el.providerSplit.innerHTML = `<div class="empty-state">No provider spend in this window yet.</div>`;
    return;
  }
  const maxCost = Math.max(...entries.map((entry) => entry.cost), 0.0001);
  el.providerSplit.innerHTML = entries.map((entry, index) => barRowMarkup({
    title: entry.provider,
    meta: `${number(entry.requests)} requests`,
    value: money(entry.cost),
    percent: Math.max(3, Math.round((entry.cost / maxCost) * 100)),
    color: CHART_PALETTE[index % CHART_PALETTE.length]
  })).join("");
}

function renderTopSpenders() {
  const users = (state.dashboard?.users || [])
    .filter((user) => (Number(user.providerCostUSD) || 0) > 0)
    .sort((lhs, rhs) => (Number(rhs.providerCostUSD) || 0) - (Number(lhs.providerCostUSD) || 0))
    .slice(0, 6);
  if (users.length === 0) {
    el.topSpenders.innerHTML = `<div class="empty-state">No provider spend recorded yet.</div>`;
    return;
  }
  const maxCost = Math.max(...users.map((user) => Number(user.providerCostUSD) || 0), 0.0001);
  el.topSpenders.innerHTML = users.map((user, index) => barRowMarkup({
    title: accountLabel(user),
    meta: planLabel(user.subscriptionProductID),
    value: money(user.providerCostUSD),
    percent: Math.max(3, Math.round(((Number(user.providerCostUSD) || 0) / maxCost) * 100)),
    color: CHART_PALETTE[index % CHART_PALETTE.length],
    clickHash: user.quotaSubjectHash
  })).join("");
}

function barRowMarkup({ title, meta, value, percent, color, clickHash }) {
  const interactive = clickHash ? ` data-detail-user="${escapeHTML(clickHash)}" role="button" tabindex="0"` : "";
  return `
    <div class="bar-row${clickHash ? " clickable" : ""}"${interactive}>
      <div class="bar-row-head">
        <span class="bar-row-title">${escapeHTML(title)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
      <span class="meter-track"><span class="meter-fill" style="width:${percent}%;background:${color}"></span></span>
      <span class="bar-row-meta">${escapeHTML(meta)}</span>
    </div>
  `;
}

function eventRowMarkup(event) {
  return `
    <div class="event-row">
      <strong>${escapeHTML(event.action || "AI request")} <span class="mini-chip">${escapeHTML(event.usageKind || "usage")}</span></strong>
      <span>${escapeHTML(event.provider || "provider")} ${escapeHTML(event.model || "")}</span>
      <span>${money(event.providerCostUSD)} / ${number(event.credits)} credits / ${formatDate(event.createdAt)}</span>
    </div>
  `;
}

function renderEvents() {
  const events = state.dashboard?.recentEvents || [];
  if (events.length === 0) {
    el.eventsList.innerHTML = `<div class="empty-state">No recent usage events yet.</div>`;
    return;
  }
  el.eventsList.innerHTML = events.slice(0, 14).map(eventRowMarkup).join("");
}

function populateEventFilters() {
  const events = state.dashboard?.recentEvents || [];
  const providers = Array.from(new Set(events.map((event) => event.provider).filter(Boolean))).sort();
  const kinds = Array.from(new Set(events.map((event) => event.usageKind).filter(Boolean))).sort();
  fillSelect(el.eventProvider, providers, state.eventProvider, "All providers");
  fillSelect(el.eventKind, kinds, state.eventKind, "All kinds");
}

function fillSelect(select, values, current, allLabel) {
  const options = [`<option value="">${escapeHTML(allLabel)}</option>`]
    .concat(values.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`));
  select.innerHTML = options.join("");
  select.value = values.includes(current) ? current : "";
  if (select.value !== current) {
    if (select === el.eventProvider) {
      state.eventProvider = select.value;
    } else if (select === el.eventKind) {
      state.eventKind = select.value;
    }
  }
}

function renderEventsFull() {
  const events = (state.dashboard?.recentEvents || []).filter((event) => {
    if (state.eventProvider && event.provider !== state.eventProvider) {
      return false;
    }
    if (state.eventKind && event.usageKind !== state.eventKind) {
      return false;
    }
    if (!state.eventSearch) {
      return true;
    }
    return [event.action, event.provider, event.model, event.uid, event.usageKind]
      .join(" ")
      .toLowerCase()
      .includes(state.eventSearch);
  });
  if (events.length === 0) {
    el.eventsListFull.innerHTML = `<div class="empty-state">No events match these filters.</div>`;
    return;
  }
  el.eventsListFull.innerHTML = events.map(eventRowMarkup).join("");
}

function renderAudit() {
  const entries = state.dashboard?.auditLog || [];
  if (entries.length === 0) {
    el.auditList.innerHTML = `<div class="empty-state">No admin changes recorded yet.</div>`;
    return;
  }
  el.auditList.innerHTML = entries.map((entry) => `
    <div class="event-row">
      <strong>${escapeHTML(entry.changes || "Updated limits")}</strong>
      <span>By ${escapeHTML(entry.byEmail || shortID(entry.byUID) || "unknown admin")} / ${formatDate(entry.at)}</span>
      <span>Subject ${escapeHTML(shortID(entry.quotaSubjectHash, 10))}${entry.note ? ` / Note: ${escapeHTML(entry.note)}` : ""}</span>
    </div>
  `).join("");
}

function applySort(key) {
  if (!key) {
    return;
  }
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = key;
    state.sort.dir = key === "account" || key === "plan" || key === "model" ? "asc" : "desc";
  }
  renderUsers();
}

function sortValue(user, key) {
  switch (key) {
    case "account":
      return accountLabel(user).toLowerCase();
    case "plan":
      return planLabel(user.subscriptionProductID).toLowerCase();
    case "videos":
      return usageRatio(user.videoUsed, user.effectiveVideoLimit);
    case "credits":
      return usageRatio(user.creditsUsed, user.effectiveCreditLimit);
    case "cost":
      return Number(user.providerCostUSD) || 0;
    case "model":
      return [user.lastProvider, user.lastModel].filter(Boolean).join(" ").toLowerCase();
    default:
      return 0;
  }
}

function renderUsers() {
  updateSortIndicators();
  const rows = (state.dashboard?.users || []).filter((user) => {
    if (!state.search) {
      return true;
    }
    return [
      user.email,
      user.displayName,
      user.authProvider,
      user.uid,
      user.quotaSubjectHash,
      user.subscriptionProductID,
      user.lastProvider,
      user.lastModel
    ].join(" ").toLowerCase().includes(state.search);
  });

  const direction = state.sort.dir === "asc" ? 1 : -1;
  rows.sort((lhs, rhs) => {
    const left = sortValue(lhs, state.sort.key);
    const right = sortValue(rhs, state.sort.key);
    if (typeof left === "string" || typeof right === "string") {
      return String(left).localeCompare(String(right)) * direction;
    }
    return (left - right) * direction;
  });

  if (rows.length === 0) {
    el.usersTable.innerHTML = `<tr><td colspan="7" class="empty-state">No matching users.</td></tr>`;
    return;
  }

  el.usersTable.innerHTML = rows.map((user) => {
    const videoPercent = percent(user.videoUsed, user.effectiveVideoLimit);
    const creditPercent = percent(user.creditsUsed, user.effectiveCreditLimit);
    const risk = riskLevel(user);
    const overrideChip = user.override ? `<span class="mini-chip">Override</span>` : "";
    const riskChip = risk === "over"
      ? `<span class="mini-chip danger">Over limit</span>`
      : risk === "near"
        ? `<span class="mini-chip warn">Near limit</span>`
        : "";
    const accountTitle = accountLabel(user);
    const accountMeta = accountMetaLabel(user);
    return `
      <tr class="${risk === "over" ? "row-over" : risk === "near" ? "row-near" : ""}">
        <td>
          <div class="user-cell">
            <strong>${escapeHTML(accountTitle)} ${overrideChip}${riskChip}</strong>
            <span class="identity-meta">${escapeHTML(accountMeta)}</span>
            <code>${escapeHTML(shortID(user.uid, 9))}</code>
          </div>
        </td>
        <td>${escapeHTML(planLabel(user.subscriptionProductID))}</td>
        <td>
          <div class="meter">
            <span>${number(user.videoUsed)} / ${number(user.effectiveVideoLimit)}</span>
            <span class="meter-track"><span class="meter-fill ${meterTone(videoPercent)}" style="width: ${videoPercent}%"></span></span>
          </div>
        </td>
        <td>
          <div class="meter">
            <span>${number(user.creditsUsed)} / ${number(user.effectiveCreditLimit)}</span>
            <span class="meter-track"><span class="meter-fill ${meterTone(creditPercent)}" style="width: ${creditPercent}%"></span></span>
          </div>
        </td>
        <td>${money(user.providerCostUSD)}</td>
        <td>${escapeHTML([user.lastProvider, user.lastModel].filter(Boolean).join(" / ") || "None")}</td>
        <td>
          <div class="row-actions">
            <button class="row-action" type="button" data-detail-user="${escapeHTML(user.quotaSubjectHash)}">Details</button>
            <button class="row-action" type="button" data-edit-user="${escapeHTML(user.quotaSubjectHash)}">Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function updateSortIndicators() {
  el.sortHeaders.forEach((header) => {
    const isActive = header.dataset.sort === state.sort.key;
    const th = header.closest("th");
    header.classList.toggle("active", isActive);
    header.dataset.arrow = isActive ? (state.sort.dir === "asc" ? "▲" : "▼") : "";
    if (th) {
      th.setAttribute("aria-sort", isActive ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
    }
  });
}

function activateTopSpender(event) {
  const row = event.target.closest("[data-detail-user]");
  if (!row || !state.dashboard) {
    return;
  }
  if (event.type === "keydown") {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }
    event.preventDefault();
  }
  const user = state.dashboard.users.find((candidate) => candidate.quotaSubjectHash === row.dataset.detailUser);
  if (user) {
    openUserDetail(user);
  }
}

function openUserDetail(user) {
  state.selectedUser = user;
  el.userDialogTitle.textContent = accountLabel(user);
  el.userDialogIdentity.innerHTML = [
    detailRow("Email", user.email || user.displayName || "No email on file"),
    detailRow("UID", user.uid || "Unknown", true),
    detailRow("Auth", user.authProvider || "Firebase Auth"),
    detailRow("Plan", `${planLabel(user.subscriptionProductID)} · ${user.period || "current"}`)
  ].join("");
  el.userDialogUsage.innerHTML = [
    usageTile("Videos", `${number(user.videoUsed)} / ${number(user.effectiveVideoLimit)}`),
    usageTile("Credits", `${number(user.creditsUsed)} / ${number(user.effectiveCreditLimit)}`),
    usageTile("Text", number(user.textUsed)),
    usageTile("Images", number(user.imageUsed)),
    usageTile("Captions", number(user.captionUsed)),
    usageTile("Provider cost", money(user.providerCostUSD)),
    usageTile("Last model", [user.lastProvider, user.lastModel].filter(Boolean).join(" / ") || "None"),
    usageTile("Override", user.override ? (user.override.disabled ? "Paused" : "Active") : "None")
  ].join("");
  const events = (state.dashboard?.recentEvents || []).filter((event) => event.uid && event.uid === user.uid);
  el.userDialogEvents.innerHTML = events.length > 0
    ? events.slice(0, 20).map(eventRowMarkup).join("")
    : `<div class="empty-state">No recent events for this user in the current window.</div>`;
  el.userDialog.showModal();
}

function detailRow(label, value, mono) {
  const valueMarkup = mono ? `<code>${escapeHTML(value)}</code>` : `<strong>${escapeHTML(value)}</strong>`;
  return `<div><span>${escapeHTML(label)}</span>${valueMarkup}</div>`;
}

function usageTile(label, value) {
  return `<div class="usage-tile"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`;
}

function openLimitDialog(user) {
  state.selectedUser = user;
  el.dialogError.classList.add("hidden");
  el.dialogError.textContent = "";
  el.dialogTitle.textContent = accountLabel(user);
  el.dialogEmail.textContent = user.email || user.displayName || "No email on file";
  el.dialogUID.textContent = user.uid || "Unknown UID";
  el.dialogHash.textContent = user.quotaSubjectHash;
  el.dialogPlan.textContent = `${planLabel(user.subscriptionProductID)} / ${user.period}`;
  el.videoLimitInput.value = user.override?.videoLimitOverride ?? user.effectiveVideoLimit;
  el.creditLimitInput.value = user.override?.creditLimitOverride ?? user.effectiveCreditLimit;
  el.clearVideoLimitInput.checked = false;
  el.clearCreditLimitInput.checked = false;
  el.disabledInput.checked = Boolean(user.override?.disabled);
  el.noteInput.value = user.override?.note || "";
  el.limitDialog.showModal();
}

function renderAccess() {
  const uid = state.status?.uid || state.user?.uid || "";
  el.accessUID.textContent = uid || "UID pending";
  el.accessStatus.textContent = state.status?.isAdmin ? "Admin" : "Locked";
  el.accessStatus.className = `status-pill ${state.status?.isAdmin ? "ready" : "locked"}`;
  el.accessIdentity.textContent = adminIdentityLabel();
  el.accessProvider.textContent = adminProviderLabel();
  el.accessWindow.textContent = `Last ${state.dashboard?.eventWindowDays || 14} days`;
  el.accessPeriod.textContent = state.dashboard?.periodKey || "Current";
  el.accessRefreshed.textContent = state.dashboard?.generatedAt ? formatDate(state.dashboard.generatedAt) : "Never";
}

function adminProviderLabel() {
  const user = state.user;
  if (!user) {
    return "Not signed in";
  }
  if (user.isAnonymous) {
    return "Anonymous";
  }
  const providers = (user.providerData || []).map((provider) => provider.providerId).filter(Boolean);
  if (providers.includes("google.com")) {
    return "Google";
  }
  return providers[0] || "Firebase Auth";
}

function adminIdentityLabel() {
  const user = state.user;
  if (!user) {
    return "Not signed in";
  }
  if (user.email) {
    return user.email;
  }
  if (user.displayName) {
    return user.displayName;
  }
  return user.isAnonymous ? "Anonymous device" : "Firebase Auth user";
}

async function saveLimits() {
  if (!state.selectedUser || !state.user) {
    return;
  }
  el.dialogError.classList.add("hidden");
  el.saveLimitsButton.disabled = true;
  try {
    const token = await state.user.getIdToken(true);
    const payload = {
      authIDToken: token,
      quotaSubjectHash: state.selectedUser.quotaSubjectHash,
      clearVideoLimit: el.clearVideoLimitInput.checked,
      clearCreditLimit: el.clearCreditLimitInput.checked,
      note: el.noteInput.value.trim(),
      disabled: el.disabledInput.checked
    };
    if (!payload.clearVideoLimit) {
      payload.videoLimitOverride = parseLimit(el.videoLimitInput.value, "Video clip limit");
    }
    if (!payload.clearCreditLimit) {
      payload.creditLimitOverride = parseLimit(el.creditLimitInput.value, "AI credit limit");
    }

    const result = await updateLimitsCallable(payload);
    state.dashboard = result.data;
    el.limitDialog.close();
    renderDashboard();
    showToast("User limits updated and dashboard refreshed.", "ready");
  } catch (error) {
    el.dialogError.textContent = errorMessage(error);
    el.dialogError.classList.remove("hidden");
  } finally {
    el.saveLimitsButton.disabled = false;
  }
}

function parseLimit(value, label) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return Math.round(numberValue);
}

function exportUsersCSV() {
  const users = state.dashboard?.users || [];
  if (users.length === 0) {
    showToast("No users to export.", "warn");
    return;
  }
  const header = [
    "email", "displayName", "authProvider", "uid", "quotaSubjectHash", "plan", "period",
    "creditsUsed", "effectiveCreditLimit", "videoUsed", "effectiveVideoLimit",
    "textUsed", "imageUsed", "captionUsed", "providerCostUSD", "lastProvider", "lastModel", "hasOverride"
  ];
  const lines = users.map((user) => [
    user.email, user.displayName, user.authProvider, user.uid, user.quotaSubjectHash,
    planLabel(user.subscriptionProductID), user.period,
    user.creditsUsed, user.effectiveCreditLimit, user.videoUsed, user.effectiveVideoLimit,
    user.textUsed, user.imageUsed, user.captionUsed, user.providerCostUSD,
    user.lastProvider, user.lastModel, user.override ? "yes" : "no"
  ]);
  downloadCSV(`soundframe-users-${state.dashboard.periodKey || "current"}.csv`, header, lines);
}

function exportEventsCSV() {
  const events = state.dashboard?.recentEvents || [];
  if (events.length === 0) {
    showToast("No events to export.", "warn");
    return;
  }
  const header = ["createdAt", "uid", "action", "usageKind", "provider", "model", "credits", "providerCostUSD"];
  const lines = events.map((event) => [
    event.createdAt, event.uid, event.action, event.usageKind,
    event.provider, event.model, event.credits, event.providerCostUSD
  ]);
  downloadCSV("soundframe-events.csv", header, lines);
}

function downloadCSV(filename, header, rows) {
  const content = [header].concat(rows)
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function copyUID() {
  const uid = state.status?.uid || state.user?.uid || "";
  if (!uid) {
    return;
  }
  try {
    await navigator.clipboard.writeText(uid);
    showToast("Firebase UID copied to clipboard.", "ready");
  } catch (error) {
    showToast(`Could not copy UID. ${errorMessage(error)}`, "warn");
  }
}

function setLoading(isLoading) {
  state.loading = isLoading;
  el.refreshButton.disabled = isLoading;
  el.refreshButton.textContent = isLoading ? "Refreshing" : "Refresh";
}

function tickFreshness() {
  if (!state.dashboard?.generatedAt || el.freshness.classList.contains("hidden")) {
    return;
  }
  const generated = new Date(state.dashboard.generatedAt).getTime();
  if (!Number.isFinite(generated)) {
    return;
  }
  el.freshness.textContent = `Updated ${timeAgo(generated)}`;
}

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

function setStatus(label, text, tone) {
  el.statusLabel.textContent = label;
  el.statusLabel.className = `status-pill ${tone || ""}`;
  el.statusText.textContent = text;
}

function showToast(message, tone) {
  el.toast.textContent = message;
  el.toast.className = `toast ${tone || ""}`;
  if (state.toastTimer) {
    clearTimeout(state.toastTimer);
  }
  state.toastTimer = setTimeout(() => {
    el.toast.classList.add("hidden");
  }, 4200);
}

function showError(message) {
  showToast(message, "warn");
  if (!state.dashboard) {
    setStatus("Error", message, "locked");
  }
}

function errorMessage(error) {
  return error?.message || String(error || "Something went wrong.");
}

function usageRatio(used, limit) {
  const usedValue = Number(used) || 0;
  const limitValue = Number(limit) || 0;
  if (limitValue <= 0) {
    return usedValue > 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return usedValue / limitValue;
}

function riskLevel(user) {
  const worst = Math.max(
    usageRatio(user.videoUsed, user.effectiveVideoLimit),
    usageRatio(user.creditsUsed, user.effectiveCreditLimit)
  );
  if (worst >= 1) {
    return "over";
  }
  if (worst >= 0.9) {
    return "near";
  }
  return "ok";
}

function meterTone(value) {
  if (value >= 100) {
    return "danger";
  }
  if (value >= 90) {
    return "warn";
  }
  return "";
}

function number(value) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(Number(value) || 0);
}

function percent(used, limit) {
  if (!limit || limit <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function shortID(value, length = 10) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  return text.length <= length * 2 ? text : `${text.slice(0, length)}...${text.slice(-6)}`;
}

function accountLabel(user) {
  return user.email || user.displayName || shortID(user.uid) || "Unknown user";
}

function accountMetaLabel(user) {
  if (user.email && user.displayName) {
    return user.displayName;
  }
  if (user.authProvider) {
    return user.authProvider;
  }
  return "Firebase Auth user";
}

function planLabel(productID) {
  if (productID?.includes("go.monthly")) {
    return "Go";
  }
  if (productID?.includes("threemonth")) {
    return "Pro 3-month";
  }
  if (productID?.includes("annual")) {
    return "Legacy annual";
  }
  if (productID?.includes("pro.monthly")) {
    return "Pro monthly";
  }
  return productID || "Unknown plan";
}

function formatDate(value) {
  if (!value) {
    return "Unknown time";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

window.addEventListener("keydown", async (event) => {
  if (event.key === "Escape") {
    if (el.userDialog.open) {
      el.userDialog.close();
    } else if (el.limitDialog.open) {
      el.limitDialog.close();
    }
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    await refresh();
  }
});

window.soundframeAdminSignOut = () => signOut(auth);
