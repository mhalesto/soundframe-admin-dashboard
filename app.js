import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, "europe-west1");

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
  chart: null,
  loading: false
};

const el = {
  navLinks: Array.from(document.querySelectorAll("[data-view-link]")),
  viewSections: Array.from(document.querySelectorAll("[data-view-section]")),
  statusPanel: document.getElementById("statusPanel"),
  statusLabel: document.getElementById("statusLabel"),
  statusText: document.getElementById("statusText"),
  uidText: document.getElementById("uidText"),
  copyUidButton: document.getElementById("copyUidButton"),
  refreshButton: document.getElementById("refreshButton"),
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
  usageChart: document.getElementById("usageChart"),
  chartRequests: document.getElementById("chartRequests"),
  chartVideos: document.getElementById("chartVideos"),
  chartCost: document.getElementById("chartCost"),
  eventsList: document.getElementById("eventsList"),
  eventsListFull: document.getElementById("eventsListFull"),
  accessUID: document.getElementById("accessUID"),
  accessStatus: document.getElementById("accessStatus"),
  usersTable: document.getElementById("usersTable"),
  userSearch: document.getElementById("userSearch"),
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
  saveLimitsButton: document.getElementById("saveLimitsButton")
};

el.navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.viewLink || "overview", true);
  });
});
el.refreshButton.addEventListener("click", () => refresh());
el.copyUidButton.addEventListener("click", copyUID);
el.userSearch.addEventListener("input", (event) => {
  state.search = event.target.value.trim().toLowerCase();
  renderUsers();
});
el.usersTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-user]");
  if (!button || !state.dashboard) {
    return;
  }
  const user = state.dashboard.users.find((candidate) => candidate.quotaSubjectHash === button.dataset.editUser);
  if (user) {
    openLimitDialog(user);
  }
});
el.saveLimitsButton.addEventListener("click", saveLimits);
window.addEventListener("hashchange", () => {
  setActiveView(viewFromHash(), false);
});

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    setStatus("Connecting", "Signing in anonymously...", "locked");
    try {
      await signInAnonymously(auth);
    } catch (error) {
      showError(`Anonymous sign-in failed. Enable Anonymous Auth in Firebase Authentication. ${errorMessage(error)}`);
    }
    return;
  }
  await refresh();
});

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
  el.dashboard.classList.add("hidden");
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
  el.setupPanel.classList.add("hidden");
  el.dashboard.classList.remove("hidden");
  el.activeUsers.textContent = number(stats.activeUsers);
  el.usageRecords.textContent = `${number(stats.usageRecords)} usage records`;
  el.videoClips.textContent = number(stats.videoClipsUsed);
  el.creditsUsed.textContent = number(stats.creditsUsed);
  el.providerCost.textContent = money(stats.providerCostUSD);
  el.activeOverrides.textContent = `${number(stats.activeOverrides)} active overrides`;
  el.periodText.textContent = state.dashboard.periodKey || "Current period";
  el.chartRequests.textContent = number((state.dashboard.usageByDay || []).reduce((sum, row) => sum + row.requests, 0));
  el.chartVideos.textContent = number((state.dashboard.usageByDay || []).reduce((sum, row) => sum + row.videos, 0));
  el.chartCost.textContent = money((state.dashboard.usageByDay || []).reduce((sum, row) => sum + row.providerCostUSD, 0));
  renderChart();
  renderEvents();
  renderUsers();
  renderAccess();
  setActiveView(state.activeView, false);
}

function setActiveView(view, updateHash) {
  const nextView = ["overview", "users", "events", "access"].includes(view) ? view : "overview";
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
  if (nextView === "overview" && state.chart) {
    requestAnimationFrame(() => state.chart?.resize());
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

function renderEvents() {
  const events = state.dashboard?.recentEvents || [];
  if (events.length === 0) {
    el.eventsList.innerHTML = `<div class="empty-state">No recent usage events yet.</div>`;
    el.eventsListFull.innerHTML = `<div class="empty-state">No recent usage events yet.</div>`;
    return;
  }
  const markup = events.map((event) => `
    <div class="event-row">
      <strong>${escapeHTML(event.action || "AI request")} <span class="mini-chip">${escapeHTML(event.usageKind || "usage")}</span></strong>
      <span>${escapeHTML(event.provider || "provider")} ${escapeHTML(event.model || "")}</span>
      <span>${money(event.providerCostUSD)} / ${number(event.credits)} credits / ${formatDate(event.createdAt)}</span>
    </div>
  `).join("");
  el.eventsList.innerHTML = markup;
  el.eventsListFull.innerHTML = markup;
}

function renderUsers() {
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

  if (rows.length === 0) {
    el.usersTable.innerHTML = `<tr><td colspan="7" class="empty-state">No matching users.</td></tr>`;
    return;
  }

  el.usersTable.innerHTML = rows.map((user) => {
    const videoPercent = percent(user.videoUsed, user.effectiveVideoLimit);
    const creditPercent = percent(user.creditsUsed, user.effectiveCreditLimit);
    const overrideChip = user.override ? `<span class="mini-chip">Override</span>` : "";
    const accountTitle = accountLabel(user);
    const accountMeta = accountMetaLabel(user);
    return `
      <tr>
        <td>
          <div class="user-cell">
            <strong>${escapeHTML(accountTitle)} ${overrideChip}</strong>
            <span class="identity-meta">${escapeHTML(accountMeta)}</span>
            <code>${escapeHTML(shortID(user.uid, 9))}</code>
          </div>
        </td>
        <td>${escapeHTML(planLabel(user.subscriptionProductID))}</td>
        <td>
          <div class="meter">
            <span>${number(user.videoUsed)} / ${number(user.effectiveVideoLimit)}</span>
            <span class="meter-track"><span class="meter-fill" style="width: ${videoPercent}%"></span></span>
          </div>
        </td>
        <td>
          <div class="meter">
            <span>${number(user.creditsUsed)} / ${number(user.effectiveCreditLimit)}</span>
            <span class="meter-track"><span class="meter-fill" style="width: ${creditPercent}%"></span></span>
          </div>
        </td>
        <td>${money(user.providerCostUSD)}</td>
        <td>${escapeHTML([user.lastProvider, user.lastModel].filter(Boolean).join(" / ") || "None")}</td>
        <td><button class="row-action" type="button" data-edit-user="${escapeHTML(user.quotaSubjectHash)}">Edit</button></td>
      </tr>
    `;
  }).join("");
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
    setStatus("Saved", "User limits updated and dashboard refreshed.", "ready");
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

async function copyUID() {
  const uid = state.status?.uid || state.user?.uid || "";
  if (!uid) {
    return;
  }
  await navigator.clipboard.writeText(uid);
  setStatus(state.status?.isAdmin ? "Admin" : "Copied", "Firebase UID copied to clipboard.", state.status?.isAdmin ? "ready" : "locked");
}

function setLoading(isLoading) {
  state.loading = isLoading;
  el.refreshButton.disabled = isLoading;
  el.refreshButton.textContent = isLoading ? "Refreshing" : "Refresh";
}

function setStatus(label, text, tone) {
  el.statusLabel.textContent = label;
  el.statusLabel.className = `status-pill ${tone || ""}`;
  el.statusText.textContent = text;
}

function showError(message) {
  state.dashboard = null;
  el.dashboard.classList.add("hidden");
  el.setupPanel.classList.remove("hidden");
  setStatus("Error", message, "locked");
  el.setupCommand.textContent = "Check that the admin Firebase Functions are deployed, then refresh this page.";
}

function errorMessage(error) {
  return error?.message || String(error || "Something went wrong.");
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
  if (event.key === "Escape" && el.limitDialog.open) {
    el.limitDialog.close();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r") {
    event.preventDefault();
    await refresh();
  }
});

window.soundframeAdminSignOut = () => signOut(auth);
