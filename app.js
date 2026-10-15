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
const financeMonitorCallable = httpsCallable(functions, "soundframeAdminFinanceMonitor");
const financeSyncCallable = httpsCallable(functions, "soundframeAdminFinanceSync", { timeout: 150000 });
const financeSettingsCallable = httpsCallable(functions, "soundframeAdminFinanceUpdateSettings");

// The provider monitor reads months of generation events, so it refreshes far less often than the
// 45-second dashboard poll: on first load, on manual Refresh, and when Finance is open and stale.
const FINANCE_REFRESH_MS = 10 * 60 * 1000;
const PROVIDER_IDS = ["byteplus", "google", "openai", "other"];
const PROVIDER_COLORS = { byteplus: "#8f7bff", google: "#37d4df", openai: "#43d18b", other: "#d9a24a" };
const PROVIDER_SHORT_NAMES = { byteplus: "BytePlus", google: "Google", openai: "OpenAI", other: "Other" };

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
  costChart: null,
  loading: false,
  toastTimer: null,
  finance: null,
  financeError: "",
  financeLoadedAt: 0,
  financeLoading: false,
  spendGranularity: "daily",
  pmModelProvider: "",
  pmModelUsedOnly: false,
  pmSpendChart: null,
  pmRevenueChart: null,
  pmMixChart: null
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
  finPeriodSpend: document.getElementById("finPeriodSpend"),
  finPeriodLabel: document.getElementById("finPeriodLabel"),
  finWindowSpend: document.getElementById("finWindowSpend"),
  finWindowCredits: document.getElementById("finWindowCredits"),
  finBurnRate: document.getElementById("finBurnRate"),
  finProjected: document.getElementById("finProjected"),
  finProjectedDetail: document.getElementById("finProjectedDetail"),
  financeCostChart: document.getElementById("financeCostChart"),
  finTrendTotal: document.getElementById("finTrendTotal"),
  finTrendPeak: document.getElementById("finTrendPeak"),
  finTrendReqs: document.getElementById("finTrendReqs"),
  finTrendLabel: document.getElementById("finTrendLabel"),
  finProviderLabel: document.getElementById("finProviderLabel"),
  finModelLabel: document.getElementById("finModelLabel"),
  financeEfficiency: document.getElementById("financeEfficiency"),
  financeProviderTable: document.getElementById("financeProviderTable"),
  financeModelTable: document.getElementById("financeModelTable"),
  finLeakLabel: document.getElementById("finLeakLabel"),
  finLeakTotal: document.getElementById("finLeakTotal"),
  finLeakJobs: document.getElementById("finLeakJobs"),
  finLeakReasonTable: document.getElementById("finLeakReasonTable"),
  finLeakRecent: document.getElementById("finLeakRecent"),
  financeUsersTable: document.getElementById("financeUsersTable"),
  exportFinanceButton: document.getElementById("exportFinanceButton"),
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

const pm = {
  syncLine: document.getElementById("pmSyncLine"),
  settingsButton: document.getElementById("pmSettingsButton"),
  syncButton: document.getElementById("pmSyncButton"),
  unavailable: document.getElementById("pmUnavailable"),
  content: document.getElementById("pmContent"),
  alerts: document.getElementById("pmAlerts"),
  tileVerified: document.getElementById("pmTileVerified"),
  verifiedBalance: document.getElementById("pmVerifiedBalance"),
  verifiedDetail: document.getElementById("pmVerifiedDetail"),
  tileEstimated: document.getElementById("pmTileEstimated"),
  estimatedBalance: document.getElementById("pmEstimatedBalance"),
  estimatedDetail: document.getElementById("pmEstimatedDetail"),
  today: document.getElementById("pmToday"),
  todayDetail: document.getElementById("pmTodayDetail"),
  month: document.getElementById("pmMonth"),
  monthDetail: document.getElementById("pmMonthDetail"),
  billed: document.getElementById("pmBilled"),
  billedDetail: document.getElementById("pmBilledDetail"),
  revenue: document.getElementById("pmRevenue"),
  revenueDetail: document.getElementById("pmRevenueDetail"),
  tileMargin: document.getElementById("pmTileMargin"),
  margin: document.getElementById("pmMargin"),
  marginDetail: document.getElementById("pmMarginDetail"),
  tileAttention: document.getElementById("pmTileAttention"),
  attention: document.getElementById("pmAttention"),
  attentionDetail: document.getElementById("pmAttentionDetail"),
  providers: document.getElementById("pmProviders"),
  spendLabel: document.getElementById("pmSpendLabel"),
  granularityButtons: Array.from(document.querySelectorAll("[data-granularity]")),
  spendChart: document.getElementById("pmSpendChart"),
  spendTotal: document.getElementById("pmSpendTotal"),
  spendPeak: document.getElementById("pmSpendPeak"),
  spendGenerations: document.getElementById("pmSpendGenerations"),
  mixChart: document.getElementById("pmProviderMixChart"),
  mixLegend: document.getElementById("pmProviderMixLegend"),
  revenueChart: document.getElementById("pmRevenueChart"),
  revenueNote: document.getElementById("pmRevenueNote"),
  topModels: document.getElementById("pmTopModels"),
  modelProvider: document.getElementById("pmModelProvider"),
  modelUsedOnly: document.getElementById("pmModelUsedOnly"),
  modelTable: document.getElementById("pmModelTable"),
  planTable: document.getElementById("pmPlanTable"),
  planNote: document.getElementById("pmPlanNote"),
  recommendations: document.getElementById("pmRecommendations"),
  notes: document.getElementById("pmNotes"),
  dialog: document.getElementById("financeSettingsDialog"),
  warning: document.getElementById("fsWarning"),
  critical: document.getElementById("fsCritical"),
  runwayWarning: document.getElementById("fsRunwayWarning"),
  runwayCritical: document.getElementById("fsRunwayCritical"),
  spikeMultiplier: document.getElementById("fsSpikeMultiplier"),
  spikeMinimum: document.getElementById("fsSpikeMinimum"),
  commission: document.getElementById("fsCommission"),
  revenueCurrent: document.getElementById("fsRevenueCurrent"),
  revenuePrevious: document.getElementById("fsRevenuePrevious"),
  revenueCurrentLabel: document.getElementById("fsRevenueCurrentLabel"),
  revenuePreviousLabel: document.getElementById("fsRevenuePreviousLabel"),
  googleTable: document.getElementById("fsGoogleTable"),
  bytePlusRegion: document.getElementById("fsBytePlusRegion"),
  error: document.getElementById("fsError"),
  saveButton: document.getElementById("fsSaveButton")
};

pm.syncButton.addEventListener("click", syncFinance);
pm.settingsButton.addEventListener("click", openFinanceSettings);
pm.saveButton.addEventListener("click", saveFinanceSettings);
pm.granularityButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.spendGranularity = button.dataset.granularity || "daily";
    pm.granularityButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
    renderSpendChart();
  });
});
pm.modelProvider.addEventListener("change", (event) => {
  state.pmModelProvider = event.target.value;
  renderModelTable();
});
pm.modelUsedOnly.addEventListener("change", (event) => {
  state.pmModelUsedOnly = event.target.checked;
  renderModelTable();
});

el.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.viewLink || "overview", true);
  });
});
el.refreshButton.addEventListener("click", () => refresh({ force: true }));
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
el.exportFinanceButton.addEventListener("click", exportFinanceCSV);
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
    state.finance = null;
    state.financeError = "";
    state.financeLoadedAt = 0;
    renderFinanceMonitor();
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

async function refresh(options = {}) {
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
    if (options.force || financeIsStale()) {
      await loadFinance(token);
    }
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
  if (el.limitDialog.open || el.userDialog.open || pm.dialog.open) {
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
  renderFinance();
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
  const nextView = ["overview", "finance", "users", "events", "audit", "access"].includes(view) ? view : "overview";
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
  if (nextView === "finance") {
    requestAnimationFrame(() => {
      state.costChart?.resize();
      state.pmSpendChart?.resize();
      state.pmRevenueChart?.resize();
      state.pmMixChart?.resize();
    });
    if (state.status?.isAdmin && !state.loading && financeIsStale()) {
      loadFinance();
    }
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
  const colors = filtered.map((entry, index) => entry.color || CHART_PALETTE[index % CHART_PALETTE.length]);
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

function renderFinance() {
  const stats = state.dashboard?.stats || {};
  const windowDays = state.dashboard?.eventWindowDays || 14;
  const rows = state.dashboard?.usageByDay || [];
  const periodCost = Number(stats.providerCostUSD) || 0;
  const windowCost = Number(stats.windowProviderCostUSD) || 0;
  const burnRate = windowDays > 0 ? windowCost / windowDays : 0;

  el.finPeriodSpend.textContent = money(periodCost);
  el.finPeriodLabel.textContent = state.dashboard?.periodKey || "Current period";
  el.finWindowSpend.textContent = money(windowCost);
  el.finWindowCredits.textContent = `${number(stats.creditsUsed || 0)} credits (period)`;
  el.finBurnRate.textContent = money(burnRate);

  const remaining = daysRemainingInMonth();
  el.finProjected.textContent = money(periodCost + burnRate * remaining);
  el.finProjectedDetail.textContent = `${number(remaining)} days left in ${state.dashboard?.periodKey || "period"}`;

  el.finTrendLabel.textContent = `Last ${windowDays} days`;
  el.finProviderLabel.textContent = `Last ${windowDays} days`;
  el.finModelLabel.textContent = `Last ${windowDays} days`;

  const peak = rows.reduce((max, row) => Math.max(max, Number(row.providerCostUSD) || 0), 0);
  const requests = rows.reduce((sum, row) => sum + (Number(row.requests) || 0), 0);
  el.finTrendTotal.textContent = money(windowCost);
  el.finTrendPeak.textContent = money(peak);
  el.finTrendReqs.textContent = number(requests);

  renderCostTrendChart();
  renderFinanceEfficiency();
  renderFinanceProviders();
  renderFinanceModels();
  renderUndeliveredVideo();
  renderFinanceUsers();
}

// Veo generations that were started (so Google billed us) but never reached the creator —
// populated by the soundframeAdminDashboard `undeliveredVideo` section (functions deploy required).
function renderUndeliveredVideo() {
  const leak = state.dashboard?.undeliveredVideo;
  el.finLeakLabel.textContent = `Last ${leak?.windowDays || state.dashboard?.eventWindowDays || 14} days`;
  el.finLeakTotal.textContent = money(leak?.estimatedCostUSD || 0);
  el.finLeakJobs.textContent = number(leak?.jobs || 0);

  const reasons = leak?.byReason || [];
  if (reasons.length === 0) {
    const message = leak
      ? "No undelivered video spend in this window."
      : "No data yet — deploy the functions build that reports undeliveredVideo.";
    el.finLeakReasonTable.innerHTML = `<tr><td colspan="3" class="empty-state">${escapeHTML(message)}</td></tr>`;
  } else {
    el.finLeakReasonTable.innerHTML = reasons.map((row) => `
      <tr>
        <td><strong>${escapeHTML(row.reason || "unknown")}</strong></td>
        <td>${number(row.jobs)}</td>
        <td>${money(row.estimatedCostUSD)}</td>
      </tr>
    `).join("");
  }

  const recent = leak?.recent || [];
  if (recent.length === 0) {
    el.finLeakRecent.innerHTML = `<div class="empty-state">Nothing undelivered recently.</div>`;
    return;
  }
  el.finLeakRecent.innerHTML = recent.slice(0, 10).map((job) => `
    <div class="event-row">
      <strong>${escapeHTML(job.model || "video")} <span class="mini-chip">${escapeHTML(job.reason || "unknown")}</span></strong>
      <span>${escapeHTML(job.uid || "unknown account")}</span>
      <span>${money(job.estimatedCostUSD)} / ${number(job.videoSeconds)}s / ${formatDate(job.createdAt)}</span>
    </div>
  `).join("");
}

function renderCostTrendChart() {
  const rows = state.dashboard?.usageByDay || [];
  const labels = rows.map((row) => row.day.slice(5));
  const data = rows.map((row) => Number(row.providerCostUSD) || 0);
  const maxCost = Math.max(0.01, ...data);
  if (state.costChart) {
    state.costChart.destroy();
  }
  const context = el.financeCostChart.getContext("2d");
  const fill = context.createLinearGradient(0, 0, 0, 220);
  fill.addColorStop(0, "rgba(217, 162, 74, 0.34)");
  fill.addColorStop(1, "rgba(217, 162, 74, 0.02)");
  state.costChart = new Chart(el.financeCostChart, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Provider cost",
        data,
        backgroundColor: fill,
        hoverBackgroundColor: "rgba(255, 196, 107, 0.6)",
        borderColor: "#d9a24a",
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 14
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(7, 9, 13, 0.96)",
          borderColor: "rgba(230, 237, 245, 0.14)",
          borderWidth: 1,
          padding: 10,
          callbacks: { label: (context) => ` ${money(context.parsed.y)}` }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#8f99aa", maxRotation: 0, autoSkipPadding: 18 }
        },
        y: {
          beginAtZero: true,
          suggestedMax: maxCost * 1.15,
          grid: { color: "rgba(230,237,245,0.07)" },
          border: { display: false },
          ticks: { color: "#8f99aa", maxTicksLimit: 4, callback: (value) => `$${Number(value).toFixed(2)}` }
        }
      }
    }
  });
}

function renderFinanceEfficiency() {
  const stats = state.dashboard?.stats || {};
  const activeUsers = Math.max(1, stats.activeUsers || 0);
  const windowRequests = Number(stats.windowRequests) || 0;
  const windowCost = Number(stats.windowProviderCostUSD) || 0;
  const periodCost = Number(stats.providerCostUSD) || 0;
  const creditsUsed = Number(stats.creditsUsed) || 0;
  const metrics = [
    { label: "Cost per request", value: windowRequests > 0 ? money(windowCost / windowRequests) : "—", meta: "Last 14 days" },
    { label: "Cost per active user", value: money(periodCost / activeUsers), meta: "This period" },
    { label: "Cost per 1,000 credits", value: creditsUsed > 0 ? money((periodCost / creditsUsed) * 1000) : "—", meta: "This period" },
    { label: "Video share of requests", value: windowRequests > 0 ? `${Math.round(((Number(stats.windowVideos) || 0) / windowRequests) * 100)}%` : "—", meta: "Last 14 days" }
  ];
  el.financeEfficiency.innerHTML = metrics.map((metric) => `
    <div class="metric-row">
      <div><span>${escapeHTML(metric.label)}</span><small>${escapeHTML(metric.meta)}</small></div>
      <strong>${escapeHTML(metric.value)}</strong>
    </div>
  `).join("");
}

function renderFinanceProviders() {
  const rows = state.dashboard?.costByModel || [];
  const byProvider = new Map();
  rows.forEach((row) => {
    const key = row.provider || "unknown";
    const entry = byProvider.get(key) || { provider: key, requests: 0, cost: 0 };
    entry.requests += Number(row.requests) || 0;
    entry.cost += Number(row.providerCostUSD) || 0;
    byProvider.set(key, entry);
  });
  const entries = Array.from(byProvider.values()).sort((lhs, rhs) => rhs.cost - lhs.cost);
  if (entries.length === 0) {
    el.financeProviderTable.innerHTML = `<tr><td colspan="4" class="empty-state">No provider spend in this window yet.</td></tr>`;
    return;
  }
  el.financeProviderTable.innerHTML = entries.map((entry) => `
    <tr>
      <td><strong>${escapeHTML(entry.provider)}</strong></td>
      <td>${number(entry.requests)}</td>
      <td>${money(entry.cost)}</td>
      <td>${entry.requests > 0 ? money(entry.cost / entry.requests) : "—"}</td>
    </tr>
  `).join("");
}

function renderFinanceModels() {
  const rows = state.dashboard?.costByModel || [];
  if (rows.length === 0) {
    el.financeModelTable.innerHTML = `<tr><td colspan="4" class="empty-state">No model spend in this window yet.</td></tr>`;
    return;
  }
  el.financeModelTable.innerHTML = rows.map((row) => {
    const requests = Number(row.requests) || 0;
    const cost = Number(row.providerCostUSD) || 0;
    return `
      <tr>
        <td>
          <div class="model-cell">
            <strong>${escapeHTML(row.model || "unknown")}</strong>
            <span class="identity-meta">${escapeHTML(row.provider || "unknown")}</span>
          </div>
        </td>
        <td>${number(requests)}</td>
        <td>${money(cost)}</td>
        <td>${requests > 0 ? money(cost / requests) : "—"}</td>
      </tr>
    `;
  }).join("");
}

function renderFinanceUsers() {
  const withCost = (state.dashboard?.users || [])
    .filter((user) => (Number(user.providerCostUSD) || 0) > 0)
    .sort((lhs, rhs) => (Number(rhs.providerCostUSD) || 0) - (Number(lhs.providerCostUSD) || 0));
  if (withCost.length === 0) {
    el.financeUsersTable.innerHTML = `<tr><td colspan="6" class="empty-state">No user spend recorded this period.</td></tr>`;
    return;
  }
  const maxCost = Math.max(...withCost.map((user) => Number(user.providerCostUSD) || 0), 0.0001);
  el.financeUsersTable.innerHTML = withCost.slice(0, 40).map((user) => {
    const cost = Number(user.providerCostUSD) || 0;
    const credits = Number(user.creditsUsed) || 0;
    const share = Math.max(3, Math.round((cost / maxCost) * 100));
    return `
      <tr>
        <td>
          <div class="user-cell">
            <strong>${escapeHTML(accountLabel(user))}</strong>
            <code>${escapeHTML(shortID(user.uid, 9))}</code>
          </div>
        </td>
        <td>${escapeHTML(planLabel(user.subscriptionProductID))}</td>
        <td>${number(credits)}</td>
        <td>${money(cost)}</td>
        <td>${credits > 0 ? money(cost / credits) : "—"}</td>
        <td><span class="meter-track"><span class="meter-fill" style="width:${share}%"></span></span></td>
      </tr>
    `;
  }).join("");
}

function exportFinanceCSV() {
  const withCost = (state.dashboard?.users || []).filter((user) => (Number(user.providerCostUSD) || 0) > 0);
  if (withCost.length === 0) {
    showToast("No spend to export.", "warn");
    return;
  }
  const header = ["account", "uid", "plan", "creditsUsed", "providerCostUSD", "costPerCredit"];
  const lines = withCost
    .sort((lhs, rhs) => (Number(rhs.providerCostUSD) || 0) - (Number(lhs.providerCostUSD) || 0))
    .map((user) => {
      const cost = Number(user.providerCostUSD) || 0;
      const credits = Number(user.creditsUsed) || 0;
      return [accountLabel(user), user.uid, planLabel(user.subscriptionProductID), credits, cost, credits > 0 ? (cost / credits).toFixed(6) : ""];
    });
  downloadCSV(`soundframe-cost-${state.dashboard.periodKey || "current"}.csv`, header, lines);
}

// --- AI provider monitoring (soundframeAdminFinance* callables) ---

function financeIsStale() {
  if (state.financeLoading) {
    return false;
  }
  if (!state.financeLoadedAt) {
    return true;
  }
  return state.activeView === "finance" && Date.now() - state.financeLoadedAt > FINANCE_REFRESH_MS;
}

async function loadFinance(token) {
  if (state.financeLoading || !state.user) {
    return;
  }
  state.financeLoading = true;
  try {
    const idToken = token || await state.user.getIdToken();
    const result = await financeMonitorCallable({ authIDToken: idToken });
    state.finance = result.data;
    state.financeError = "";
  } catch (error) {
    state.financeError = errorMessage(error);
  } finally {
    state.financeLoadedAt = Date.now();
    state.financeLoading = false;
    renderFinanceMonitor();
  }
}

async function syncFinance() {
  if (!state.user || !state.finance) {
    return;
  }
  pm.syncButton.disabled = true;
  pm.syncButton.textContent = "Syncing…";
  try {
    const token = await state.user.getIdToken();
    const result = await financeSyncCallable({ authIDToken: token });
    state.finance = result.data;
    state.financeError = "";
    state.financeLoadedAt = Date.now();
    renderFinanceMonitor();
    const summary = state.finance.providers
      .map((card) => `${PROVIDER_SHORT_NAMES[card.id]}: balance ${credentialLabel(card.sync.balanceStatus).toLowerCase()}, spend ${credentialLabel(card.sync.spendStatus).toLowerCase()}`)
      .join(" · ");
    showToast(summary, "ready");
  } catch (error) {
    showToast(`Billing sync failed. ${errorMessage(error)}`, "warn");
  } finally {
    pm.syncButton.textContent = "Sync balances";
    pm.syncButton.disabled = !state.finance;
  }
}

function renderFinanceMonitor() {
  const data = state.finance;
  pm.settingsButton.disabled = !data;
  pm.syncButton.disabled = !data;
  if (!data) {
    pm.content.classList.add("hidden");
    pm.unavailable.classList.remove("hidden");
    if (state.financeError) {
      pm.syncLine.textContent = "Provider monitoring unavailable";
      pm.unavailable.innerHTML = `
        <p><strong>Provider monitoring is not available yet.</strong></p>
        <p>Deploy the functions build that adds <code>soundframeAdminFinanceMonitor</code>, then press Refresh.</p>
        <p class="identity-meta">${escapeHTML(state.financeError)}</p>
      `;
    } else {
      pm.syncLine.textContent = "Loading provider data…";
      pm.unavailable.innerHTML = `<div class="empty-state">Loading provider balances and spend…</div>`;
    }
    return;
  }
  pm.unavailable.classList.add("hidden");
  pm.content.classList.remove("hidden");
  renderMonitorSyncLine();
  renderMonitorAlerts();
  renderMonitorOverview();
  renderProviderCards();
  renderSpendChart();
  renderProviderMix();
  renderRevenueChart();
  renderTopModels();
  renderModelTable();
  renderPlanTable();
  renderRecommendations();
}

function renderMonitorSyncLine() {
  const data = state.finance;
  const attempts = data.providers.map((card) => Date.parse(card.sync.lastAttemptAt)).filter(Number.isFinite);
  const generated = Date.parse(data.generatedAt);
  const parts = [
    attempts.length > 0 ? `Billing synced ${timeAgo(Math.max(...attempts))}` : "Billing never synced — press Sync balances",
    "auto-sync every 6 hours",
    Number.isFinite(generated) ? `figures ${timeAgo(generated)}` : ""
  ];
  if (state.financeError) {
    parts.push("last refresh failed");
  }
  pm.syncLine.textContent = parts.filter(Boolean).join(" · ");
}

function alertRowMarkup(alert) {
  const tone = alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warn" : "";
  const label = alert.severity === "critical" ? "Critical" : alert.severity === "warning" ? "Warning" : "Note";
  return `
    <div class="alert-row ${escapeHTML(alert.severity)}">
      <span class="mini-chip ${tone}">${label}</span>
      <span>${escapeHTML(alert.message)}</span>
    </div>
  `;
}

function renderMonitorAlerts() {
  const alerts = state.finance.alerts || [];
  const actionable = alerts.filter((alert) => alert.severity !== "info");
  const notes = alerts.filter((alert) => alert.severity === "info");
  const healthy = actionable.length === 0
    ? `<div class="alert-row ok"><span class="mini-chip ready">OK</span><span>No balance, runway or spending alerts right now.</span></div>`
    : "";
  const noteBlock = notes.length > 0
    ? `<details class="alert-notes"><summary>${number(notes.length)} ${notes.length === 1 ? "note" : "notes"} about balances and tracking</summary>${notes.map(alertRowMarkup).join("")}</details>`
    : "";
  pm.alerts.innerHTML = actionable.map(alertRowMarkup).join("") + healthy + noteBlock;
}

function providerNames(ids) {
  return ids.map((id) => PROVIDER_SHORT_NAMES[id] || id).join(", ");
}

function renderMonitorOverview() {
  const data = state.finance;
  const overview = data.overview;
  const spend = overview.estimatedSpend;
  const noBalanceAPI = data.providers.filter((card) => !card.capabilities.balance.supported).map((card) => card.id);

  pm.verifiedBalance.textContent = overview.verifiedBalanceUSD === null ? "—" : money2(overview.verifiedBalanceUSD);
  pm.verifiedDetail.textContent = overview.verifiedBalanceProviders.length > 0
    ? `${providerNames(overview.verifiedBalanceProviders)} verified by API`
    : "No balance verified yet";
  const estimated = data.providers.filter((card) => card.balance.kind === "manual_estimate");
  pm.estimatedBalance.textContent = overview.estimatedBalanceUSD === null ? "Not recorded" : money2(overview.estimatedBalanceUSD);
  pm.estimatedDetail.textContent = estimated.length > 0
    ? `${providerNames(estimated.map((card) => card.id))}: manual balance − tracked spend`
    : `${providerNames(noBalanceAPI)} have no balance API — add one in Settings`;

  pm.today.textContent = money2(spend.todayUSD);
  pm.todayDetail.textContent = `Yesterday ${money2(spend.yesterdayUSD)} · 7-day avg ${money2(spend.dailyAverage7USD)}/day`;
  pm.month.textContent = money2(spend.monthToDateUSD);
  pm.monthDetail.textContent = `Projected ${money2(overview.projectedMonthCostUSD)} by month end`;
  pm.billed.textContent = overview.verifiedSpendMonthToDateUSD === null ? "Not connected" : money2(overview.verifiedSpendMonthToDateUSD);
  pm.billedDetail.textContent = overview.verifiedSpendProviders.length > 0
    ? `Verified: ${providerNames(overview.verifiedSpendProviders)}`
    : "Add billing credentials to verify";

  const revenue = overview.revenue;
  pm.revenue.textContent = revenue.monthUSD === null ? "—" : money2(revenue.monthUSD);
  pm.revenueDetail.textContent = revenue.basis === "manual"
    ? "Net proceeds entered from App Store Connect"
    : revenue.basis === "estimated"
      ? `Estimated · ${number(revenue.payingSubscribers)} paying${revenue.testSubscribers ? `, ${number(revenue.testSubscribers)} test excluded` : ""}`
      : "No paying subscribers seen this month";

  pm.margin.textContent = overview.grossMarginUSD === null ? "—" : money2(overview.grossMarginUSD);
  pm.marginDetail.textContent = overview.grossMarginPercent === null
    ? "Needs revenue and cost data"
    : `${overview.grossMarginPercent}% of revenue after projected AI cost`;
  pm.tileMargin.classList.toggle("tile-danger", overview.grossMarginUSD !== null && overview.grossMarginUSD < 0);
  pm.tileMargin.classList.toggle("tile-warn", overview.grossMarginPercent !== null && overview.grossMarginPercent >= 0 && overview.grossMarginPercent < 30);

  const critical = data.providers.some((card) => card.status === "critical");
  pm.attention.textContent = number(overview.providersRequiringAttention);
  pm.attentionDetail.textContent = overview.shortestRunwayDays === null
    ? "No runway yet — needs a balance"
    : `Shortest runway ${overview.shortestRunwayDays} days`;
  pm.tileAttention.classList.toggle("tile-danger", critical);
  pm.tileAttention.classList.toggle("tile-warn", !critical && overview.providersRequiringAttention > 0);
  pm.tileVerified.classList.toggle("tile-danger", data.providers.some((card) => card.balance.kind === "verified" && card.status === "critical"));
}

function credentialLabel(status) {
  return {
    verified: "Verified",
    unavailable: "No API",
    not_configured: "Not configured",
    permission_denied: "Permission denied",
    error: "Error",
    never: "Never synced"
  }[status] || status || "Unknown";
}

function providerCardMarkup(card) {
  const balance = card.balance;
  const kindLabel = {
    verified: "Verified balance",
    stale: "Last verified balance",
    manual_estimate: "Estimated balance",
    unavailable: "Balance unavailable"
  }[balance.kind] || "Balance";
  const statusChip = {
    ok: ["ready", "Healthy"],
    warning: ["warn", "Warning"],
    critical: ["danger", "Critical"],
    unavailable: ["", "Unavailable"]
  }[card.status] || ["", card.status];
  const asOf = balance.asOf
    ? `${balance.kind === "manual_estimate" ? "Recorded" : "As of"} ${formatDate(balance.asOf)}`
    : card.capabilities.balance.supported ? "Not synced yet" : "No balance API";
  const currency = balance.availableUSD === null ? "" : `${escapeHTML(balance.currency)}${balance.currencyReported ? "" : " (assumed)"} · `;
  const balanceDetail = balance.kind === "manual_estimate" && balance.manual
    ? `${money2(balance.manual.amountUSD)} recorded − ${money2(balance.manual.spentSinceUSD)} tracked since`
    : balance.kind === "verified" || balance.kind === "stale"
      ? `Cash ${balance.cashUSD === null ? "—" : money2(balance.cashUSD)} · Credit ${balance.creditUSD === null ? "—" : money2(balance.creditUSD)}`
      : escapeHTML(card.capabilities.balance.note);
  const estimated = card.estimatedSpend;
  const verified = card.verifiedSpend;
  const runway = card.runway;
  const capacity = card.capacity;
  const metric = (label, value, detail) => `
    <div class="provider-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </div>
  `;
  const messages = (card.sync.messages || []).map((message) => `<li>${escapeHTML(message)}</li>`).join("");
  const capability = (label, entry) => `
    <div class="capability">
      <strong>${label}: ${entry.supported ? "supported" : "not available"}</strong>
      <span>${escapeHTML(entry.method)}</span>
      ${entry.credentials.length ? `<span>Credentials: <code>${entry.credentials.map(escapeHTML).join("</code>, <code>")}</code></span>` : ""}
      ${entry.permissions ? `<span>${escapeHTML(entry.permissions)}</span>` : ""}
      <span class="identity-meta">${escapeHTML(entry.note)}</span>
    </div>
  `;
  return `
    <article class="panel provider-card status-${escapeHTML(card.status)}">
      <div class="provider-card-head">
        <div>
          <p class="eyebrow">${kindLabel}</p>
          <h3>${escapeHTML(card.name)}</h3>
        </div>
        <span class="mini-chip ${statusChip[0]}">${statusChip[1]}</span>
      </div>
      <div class="provider-balance">
        <strong>${balance.availableUSD === null ? "Unavailable" : money2(balance.availableUSD)}</strong>
        <span>${currency}${escapeHTML(asOf)}</span>
        <small>${balanceDetail}</small>
      </div>
      <div class="provider-metrics">
        ${metric("Today", money2(estimated.todayUSD), `7-day avg ${money2(estimated.dailyAverage7USD)}/day`)}
        ${metric("This month", money2(estimated.monthToDateUSD), verified ? `Billed ${money2(verified.monthToDate)} (verified)` : "Billing not connected")}
        ${metric("Runway", runway.days === null ? "—" : `${runway.days} days`,
          runway.days !== null ? `Until ${formatDay(runway.exhaustionDate)} at ${money2(runway.burnPerDayUSD)}/day`
            : balance.availableUSD === null ? "Needs a balance" : "No recent spend")}
        ${metric("Capacity", capacity.generationsRemaining === null ? "—" : `≈${number(capacity.generationsRemaining)}`,
          capacity.averageCostPerGenerationUSD ? `generations at ${money2(capacity.averageCostPerGenerationUSD)} each` : "No priced generations")}
      </div>
      <div class="provider-sync">
        <span>Balance: <strong>${credentialLabel(card.sync.balanceStatus)}</strong></span>
        <span>Spend: <strong>${credentialLabel(card.sync.spendStatus)}</strong></span>
        <span>${card.sync.lastSuccessAt ? `Last success ${timeAgo(Date.parse(card.sync.lastSuccessAt))}` : "Never synced successfully"}</span>
      </div>
      <details class="provider-details">
        <summary>Billing access and sync messages</summary>
        ${messages ? `<ul class="sync-messages">${messages}</ul>` : ""}
        ${capability("Balance", card.capabilities.balance)}
        ${capability("Spend", card.capabilities.spend)}
        ${verified && verified.breakdown.length ? `<div class="capability"><strong>Billed this month by line item</strong>${verified.breakdown.slice(0, 6)
          .map((row) => `<span>${escapeHTML(row.label)}: ${money2(row.amount)}${row.ai ? "" : " (not AI)"}</span>`).join("")}</div>` : ""}
        <a class="console-link" href="${escapeHTML(card.consoleURL)}" target="_blank" rel="noopener noreferrer">Open ${escapeHTML(PROVIDER_SHORT_NAMES[card.id])} console</a>
      </details>
    </article>
  `;
}

function renderProviderCards() {
  pm.providers.innerHTML = state.finance.providers.map(providerCardMarkup).join("");
}

function financeChartOptions(stacked) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { align: "end", labels: { color: "#c4cad6", boxWidth: 8, boxHeight: 8, usePointStyle: true, padding: 14 } },
      tooltip: {
        backgroundColor: "rgba(7, 9, 13, 0.96)",
        borderColor: "rgba(230, 237, 245, 0.14)",
        borderWidth: 1,
        padding: 10,
        callbacks: { label: (context) => ` ${context.dataset.label}: ${context.parsed.y === null ? "—" : money2(context.parsed.y)}` }
      }
    },
    scales: {
      x: { stacked, grid: { display: false }, border: { display: false }, ticks: { color: "#8f99aa", maxRotation: 0, autoSkipPadding: 18 } },
      y: {
        stacked,
        beginAtZero: true,
        grid: { color: "rgba(230,237,245,0.07)" },
        border: { display: false },
        ticks: { color: "#8f99aa", maxTicksLimit: 5, callback: (value) => `$${Number(value).toFixed(Number(value) < 10 ? 2 : 0)}` }
      }
    }
  };
}

function renderSpendChart() {
  const granularity = state.spendGranularity;
  const points = state.finance.series[granularity] || [];
  const labels = points.map((point) => `${point.label}${point.partial ? "*" : ""}`);
  const used = PROVIDER_IDS.filter((id) => points.some((point) => (point.byProvider?.[id] || 0) > 0));
  const datasets = (used.length > 0 ? used : ["byteplus"]).map((id) => ({
    label: PROVIDER_SHORT_NAMES[id],
    data: points.map((point) => point.byProvider?.[id] || 0),
    backgroundColor: PROVIDER_COLORS[id],
    borderRadius: 4,
    maxBarThickness: granularity === "daily" ? 10 : 26,
    stack: "spend"
  }));
  if (state.pmSpendChart) {
    state.pmSpendChart.destroy();
  }
  state.pmSpendChart = new Chart(pm.spendChart, { type: "bar", data: { labels, datasets }, options: financeChartOptions(true) });
  pm.spendLabel.textContent = {
    daily: "Last 90 days · estimated",
    weekly: "Last 26 weeks · estimated",
    monthly: "Last 6 months · estimated"
  }[granularity];
  const total = points.reduce((sum, point) => sum + (Number(point.totalUSD) || 0), 0);
  pm.spendTotal.textContent = money2(total);
  pm.spendPeak.textContent = money2(Math.max(0, ...points.map((point) => Number(point.totalUSD) || 0)));
  pm.spendGenerations.textContent = number(points.reduce((sum, point) => sum + (Number(point.generations) || 0), 0));
}

function renderProviderMix() {
  const data = state.finance;
  const other = data.series.monthly.at(-1)?.byProvider?.other || 0;
  const entries = data.providers.map((card) => ({
    label: PROVIDER_SHORT_NAMES[card.id],
    value: Number(card.estimatedSpend.monthToDateUSD) || 0,
    color: PROVIDER_COLORS[card.id]
  }));
  if (other > 0) {
    entries.push({ label: "Other", value: other, color: PROVIDER_COLORS.other });
  }
  state.pmMixChart = renderDoughnut(state.pmMixChart, pm.mixChart, pm.mixLegend, entries.sort((lhs, rhs) => rhs.value - lhs.value), money2);
}

function renderRevenueChart() {
  const data = state.finance;
  const points = data.series.monthly || [];
  if (state.pmRevenueChart) {
    state.pmRevenueChart.destroy();
  }
  const datasets = [
    {
      type: "bar",
      label: "AI cost (estimated)",
      data: points.map((point) => Number(point.totalUSD) || 0),
      backgroundColor: "rgba(217, 162, 74, 0.78)",
      borderRadius: 6,
      maxBarThickness: 34,
      order: 2
    },
    {
      type: "line",
      label: "Revenue (net)",
      data: points.map((point) => point.revenueUSD),
      borderColor: "#43d18b",
      backgroundColor: "#43d18b",
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.25,
      spanGaps: false,
      order: 1
    }
  ];
  if (points.some((point) => point.verifiedUSD !== null)) {
    datasets.push({
      type: "line",
      label: "Billed (verified)",
      data: points.map((point) => point.verifiedUSD),
      borderColor: "#8f7bff",
      backgroundColor: "#8f7bff",
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 3,
      spanGaps: false,
      order: 0
    });
  }
  state.pmRevenueChart = new Chart(pm.revenueChart, {
    type: "bar",
    data: { labels: points.map((point) => `${point.label}${point.partial ? "*" : ""}`), datasets },
    options: financeChartOptions(false)
  });
  const current = points.at(-1);
  pm.revenueNote.textContent = [
    current?.revenueBasis === "manual" ? "This month's revenue was entered from App Store Connect." : "Revenue is estimated from subscribers who used AI each month.",
    "Verified billing covers only providers with billing access.",
    points.some((point) => point.partial) ? "* Month starts before the 183-day event window." : ""
  ].filter(Boolean).join(" ");
}

function renderTopModels() {
  const rows = state.finance.models.filter((row) => row.spend30dUSD > 0).slice(0, 8);
  if (rows.length === 0) {
    pm.topModels.innerHTML = `<div class="empty-state">No priced generations in the last 30 days.</div>`;
    return;
  }
  const max = Math.max(...rows.map((row) => row.spend30dUSD), 0.0001);
  pm.topModels.innerHTML = rows.map((row) => barRowMarkup({
    title: row.label,
    meta: `${PROVIDER_SHORT_NAMES[row.provider] || row.providerName} · ${number(row.generations30d)} generations${row.averageCostUSD !== null ? ` · ${money2(row.averageCostUSD)} avg` : ""}`,
    value: money2(row.spend30dUSD),
    percent: Math.max(3, Math.round((row.spend30dUSD / max) * 100)),
    color: PROVIDER_COLORS[row.provider] || PROVIDER_COLORS.other
  })).join("");
}

function successMarkup(outcomes) {
  if (!outcomes) {
    return `<span class="identity-meta">Not tracked</span>`;
  }
  const finished = outcomes.succeeded + outcomes.failed;
  if (outcomes.successRate === null) {
    return outcomes.pending ? `<span class="identity-meta">${number(outcomes.pending)} running</span>` : `<span class="identity-meta">—</span>`;
  }
  const tone = outcomes.successRate >= 95 ? "ready" : outcomes.successRate >= 80 ? "warn" : "danger";
  const extra = [outcomes.cancelled ? `${number(outcomes.cancelled)} cancelled` : "", outcomes.pending ? `${number(outcomes.pending)} running` : ""]
    .filter(Boolean).join(" · ");
  return `
    <span class="mini-chip ${tone}">${outcomes.successRate}%</span>
    <span class="identity-meta">${number(outcomes.succeeded)}/${number(finished)} succeeded${extra ? ` · ${extra}` : ""}</span>
  `;
}

function renderModelTable() {
  let rows = state.finance?.models || [];
  if (state.pmModelProvider) {
    rows = rows.filter((row) => row.provider === state.pmModelProvider);
  }
  if (state.pmModelUsedOnly) {
    rows = rows.filter((row) => row.generations30d > 0 || row.spend30dUSD > 0 || row.generationsMonthToDate > 0);
  }
  if (rows.length === 0) {
    pm.modelTable.innerHTML = `<tr><td colspan="8" class="empty-state">No models match this filter.</td></tr>`;
    return;
  }
  pm.modelTable.innerHTML = rows.map((row) => {
    const average = row.averageCostUSD !== null
      ? money2(row.averageCostUSD)
      : row.nominalCostUSD !== null ? `<span class="identity-meta">~${money2(row.nominalCostUSD)} list</span>` : "—";
    return `
      <tr>
        <td>
          <div class="model-cell">
            <strong>${escapeHTML(row.label)}${row.catalogued ? "" : ` <span class="mini-chip warn">Uncatalogued</span>`}</strong>
            <span class="identity-meta">${escapeHTML(PROVIDER_SHORT_NAMES[row.provider] || row.providerName)} · <code>${escapeHTML(row.model)}</code></span>
            <span class="identity-meta">${escapeHTML(row.usedBy)}</span>
          </div>
        </td>
        <td class="price-cell">${escapeHTML(row.listPrice)}</td>
        <td>${number(row.generations30d)}${row.unpriced30d ? ` <span class="mini-chip warn" title="Generations with no recorded provider cost">${number(row.unpriced30d)} unpriced</span>` : ""}</td>
        <td>${money2(row.spend30dUSD)}</td>
        <td>${average}</td>
        <td class="success-cell">${successMarkup(row.outcomes)}</td>
        <td>${row.generationsRemaining === null ? "—" : `≈${number(row.generationsRemaining)}`}</td>
        <td>${number(row.generationsMonthToDate)} · ${money2(row.spendMonthToDateUSD)}</td>
      </tr>
    `;
  }).join("");
}

function renderPlanTable() {
  const profitability = state.finance.profitability;
  pm.planTable.innerHTML = profitability.rows.map((row) => {
    const worst = row.worstCaseMarginUSD === null
      ? ""
      : ` <span class="mini-chip ${row.worstCaseMarginUSD < 0 ? "danger" : "ready"}">${row.worstCaseMarginUSD < 0 ? "loss" : "profit"} ${money2(Math.abs(row.worstCaseMarginUSD))}</span>`;
    return `
      <tr>
        <td>
          <div class="model-cell">
            <strong>${escapeHTML(row.label)}</strong>
            <span class="identity-meta">${row.priceUSD === null ? "Price not set" : `${money2(row.priceUSD)} list`}</span>
          </div>
        </td>
        <td>${row.netMonthlyUSD === null ? "—" : money2(row.netMonthlyUSD)}</td>
        <td>${number(row.payingSubscribers)}${row.testSubscribers ? ` <span class="identity-meta">+${number(row.testSubscribers)} test</span>` : ""}</td>
        <td>${row.revenueUSD === null ? "—" : money2(row.revenueUSD)}</td>
        <td>${money2(row.costUSD)}${row.testCostUSD ? ` <span class="identity-meta">+${money2(row.testCostUSD)} test</span>` : ""}</td>
        <td class="${row.marginUSD !== null && row.marginUSD < 0 ? "negative" : ""}">${row.marginUSD === null ? "—" : money2(row.marginUSD)}</td>
        <td>${money2(row.worstCaseCostUSD)}${worst}</td>
      </tr>
    `;
  }).join("");
  pm.planNote.textContent = `${profitability.basis} Full-allowance cost assumes ${money2(profitability.typicalVideoCostUSD)} per video clip ` +
    `and ${money2(profitability.typicalPreviewCostUSD)} per music-video preview, plus every AI credit spent.`;
}

function renderRecommendations() {
  const data = state.finance;
  const recommendations = data.recommendations || [];
  pm.recommendations.innerHTML = recommendations.length === 0
    ? `<div class="empty-state">No recommendations right now.</div>`
    : recommendations.map((item) => `
      <div class="recommendation">
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.detail)}</span>
      </div>
    `).join("");
  const quality = data.dataQuality;
  const notes = [...quality.notes];
  if (quality.uncataloguedModels.length > 0) {
    notes.push(`Models seen in events but missing from the catalogue: ${quality.uncataloguedModels.join(", ")}.`);
  }
  notes.push("BytePlus balances come from QueryBalanceAcct, which reports the prepaid balance; Google and OpenAI do not offer balance APIs.");
  pm.notes.innerHTML = notes.map((note) => `<li>${escapeHTML(note)}</li>`).join("");
}

function previousPeriodKey(period) {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function setInputValue(input, value) {
  input.value = value === null || value === undefined ? "" : String(value);
}

function openFinanceSettings() {
  const data = state.finance;
  if (!data) {
    return;
  }
  const settings = data.settings;
  setInputValue(pm.warning, settings.thresholds.warningUSD);
  setInputValue(pm.critical, settings.thresholds.criticalUSD);
  pm.dialog.querySelectorAll("[data-threshold]").forEach((input) => {
    setInputValue(input, settings.thresholds.perProvider?.[input.dataset.threshold]?.[input.dataset.level]);
  });
  setInputValue(pm.runwayWarning, settings.runway.warningDays);
  setInputValue(pm.runwayCritical, settings.runway.criticalDays);
  setInputValue(pm.spikeMultiplier, settings.spike.multiplier);
  setInputValue(pm.spikeMinimum, settings.spike.minimumDailyUSD);
  pm.dialog.querySelectorAll("[data-manual]").forEach((input) => {
    const entry = settings.manualBalances?.[input.dataset.manual];
    const value = entry?.[input.dataset.field];
    setInputValue(input, input.dataset.field === "asOf" && value ? String(value).slice(0, 10) : value);
  });
  setInputValue(pm.commission, Math.round(settings.revenue.appleCommissionRate * 100));
  pm.dialog.querySelectorAll("[data-price]").forEach((input) => {
    setInputValue(input, settings.revenue.planPricesUSD?.[input.dataset.price]);
  });
  const current = data.periodKey;
  const previous = previousPeriodKey(current);
  pm.revenueCurrentLabel.textContent = `App Store net proceeds ${current}`;
  pm.revenuePreviousLabel.textContent = `App Store net proceeds ${previous}`;
  setInputValue(pm.revenueCurrent, settings.revenue.manualMonthlyNetUSD?.[current]);
  setInputValue(pm.revenuePrevious, settings.revenue.manualMonthlyNetUSD?.[previous]);
  setInputValue(pm.googleTable, settings.googleBillingExportTable);
  setInputValue(pm.bytePlusRegion, settings.bytePlusBillingRegion);
  pm.error.classList.add("hidden");
  pm.error.textContent = "";
  pm.dialog.showModal();
}

function optionalNumber(input) {
  const value = input.value.trim();
  return value === "" ? null : Number(value);
}

function collectFinanceSettings() {
  const data = state.finance;
  const settings = data.settings;
  const perProvider = {};
  ["byteplus", "google", "openai"].forEach((id) => {
    const warning = optionalNumber(pm.dialog.querySelector(`[data-threshold="${id}"][data-level="warningUSD"]`));
    const critical = optionalNumber(pm.dialog.querySelector(`[data-threshold="${id}"][data-level="criticalUSD"]`));
    if (warning === null && critical === null) {
      return;
    }
    if (warning === null || critical === null) {
      throw new Error(`Enter both thresholds for ${PROVIDER_SHORT_NAMES[id]}, or leave both blank to use the default.`);
    }
    perProvider[id] = { warningUSD: warning, criticalUSD: critical };
  });
  const manualBalances = {};
  ["byteplus", "google", "openai"].forEach((id) => {
    const amount = optionalNumber(pm.dialog.querySelector(`[data-manual="${id}"][data-field="amountUSD"]`));
    const asOf = pm.dialog.querySelector(`[data-manual="${id}"][data-field="asOf"]`).value;
    if (amount === null) {
      return;
    }
    if (!asOf) {
      throw new Error(`Add the date the ${PROVIDER_SHORT_NAMES[id]} balance was read.`);
    }
    manualBalances[id] = { amountUSD: amount, asOf, note: settings.manualBalances?.[id]?.note || "" };
  });
  const planPricesUSD = {};
  pm.dialog.querySelectorAll("[data-price]").forEach((input) => {
    planPricesUSD[input.dataset.price] = optionalNumber(input);
  });
  const manualMonthlyNetUSD = { ...(settings.revenue.manualMonthlyNetUSD || {}) };
  const current = data.periodKey;
  const previous = previousPeriodKey(current);
  [[current, pm.revenueCurrent], [previous, pm.revenuePrevious]].forEach(([period, input]) => {
    const value = optionalNumber(input);
    if (value === null) {
      delete manualMonthlyNetUSD[period];
    } else {
      manualMonthlyNetUSD[period] = value;
    }
  });
  const commission = optionalNumber(pm.commission);
  return {
    thresholds: { warningUSD: optionalNumber(pm.warning), criticalUSD: optionalNumber(pm.critical), perProvider },
    runway: { warningDays: optionalNumber(pm.runwayWarning), criticalDays: optionalNumber(pm.runwayCritical) },
    spike: { multiplier: optionalNumber(pm.spikeMultiplier), minimumDailyUSD: optionalNumber(pm.spikeMinimum) },
    revenue: { appleCommissionRate: commission === null ? null : commission / 100, planPricesUSD, manualMonthlyNetUSD },
    manualBalances,
    googleBillingExportTable: pm.googleTable.value.trim(),
    bytePlusBillingRegion: pm.bytePlusRegion.value.trim()
  };
}

async function saveFinanceSettings() {
  if (!state.user || !state.finance) {
    return;
  }
  pm.error.classList.add("hidden");
  let settings;
  try {
    settings = collectFinanceSettings();
  } catch (error) {
    pm.error.textContent = errorMessage(error);
    pm.error.classList.remove("hidden");
    return;
  }
  pm.saveButton.disabled = true;
  pm.saveButton.textContent = "Saving…";
  try {
    const token = await state.user.getIdToken();
    const result = await financeSettingsCallable({ authIDToken: token, settings });
    state.finance = result.data;
    state.financeError = "";
    state.financeLoadedAt = Date.now();
    renderFinanceMonitor();
    pm.dialog.close();
    showToast("Finance settings saved.", "ready");
  } catch (error) {
    pm.error.textContent = errorMessage(error);
    pm.error.classList.remove("hidden");
  } finally {
    pm.saveButton.disabled = false;
    pm.saveButton.textContent = "Save settings";
  }
}

function daysRemainingInMonth() {
  const now = new Date();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return Math.max(0, daysInMonth - now.getUTCDate());
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
      ${entry.quotaSubjectHash || entry.note
        ? `<span>${entry.quotaSubjectHash ? `Subject ${escapeHTML(shortID(entry.quotaSubjectHash, 10))}` : ""}${entry.quotaSubjectHash && entry.note ? " / " : ""}${entry.note ? `Note: ${escapeHTML(entry.note)}` : ""}</span>`
        : ""}
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

// Balances and spend read best in cents; sub-dollar unit costs keep up to four decimals.
function money2(value) {
  const amount = Number(value) || 0;
  const precise = amount !== 0 && Math.abs(amount) < 1;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: precise ? 4 : 2
  }).format(amount);
}

function formatDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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
