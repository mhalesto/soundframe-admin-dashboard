// Form dialogs that write data: the quota override editor and Finance settings. Field IDs, validation and
// callables are unchanged from the previous dashboard.
import { state, emit } from "./store.js";
import { api, describeError } from "./api.js";
import { planLabel, accountLabel, previousPeriodKey, PROVIDER_NAMES } from "./format.js";
import { toast, prefersReducedMotion, $ } from "./ui.js";

// ---------- Dialog open/close with motion ----------
export function showDialog(dialog) {
  dialog.classList.remove("is-closing");
  if (!dialog.open) dialog.showModal();
}

export function closeDialog(dialog, returnValue) {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  if (prefersReducedMotion()) {
    dialog.close(returnValue);
    return;
  }
  dialog.classList.add("is-closing");
  setTimeout(() => {
    dialog.classList.remove("is-closing");
    dialog.close(returnValue);
  }, 150);
}

/** Animate Escape/cancel and form[method=dialog] submits instead of the browser's instant close. */
export function enhanceDialog(dialog) {
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeDialog(dialog, "cancel");
  });
  dialog.addEventListener("submit", (event) => {
    if (event.target.method === "dialog") {
      event.preventDefault();
      closeDialog(dialog, event.submitter?.value || "cancel");
    }
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog(dialog, "cancel");
  });
}

// ---------- Quota override editor ----------
const limit = {
  dialog: $("#limitDialog"),
  title: $("#dialogTitle"),
  email: $("#dialogEmail"),
  uid: $("#dialogUID"),
  hash: $("#dialogHash"),
  plan: $("#dialogPlan"),
  videoLimit: $("#videoLimitInput"),
  clearVideo: $("#clearVideoLimitInput"),
  creditLimit: $("#creditLimitInput"),
  clearCredit: $("#clearCreditLimitInput"),
  note: $("#noteInput"),
  disabled: $("#disabledInput"),
  error: $("#dialogError"),
  save: $("#saveLimitsButton")
};
let editingUser = null;

export function openLimitDialog(user) {
  editingUser = user;
  limit.error.classList.add("hidden");
  limit.error.textContent = "";
  limit.title.textContent = accountLabel(user);
  limit.email.textContent = user.email || user.displayName || "No email on file";
  limit.uid.textContent = user.uid || "Unknown UID";
  limit.hash.textContent = user.quotaSubjectHash;
  limit.plan.textContent = `${planLabel(user.subscriptionProductID)} · ${user.period}`;
  limit.videoLimit.value = user.override?.videoLimitOverride ?? user.effectiveVideoLimit;
  limit.creditLimit.value = user.override?.creditLimitOverride ?? user.effectiveCreditLimit;
  limit.clearVideo.checked = false;
  limit.clearCredit.checked = false;
  limit.disabled.checked = Boolean(user.override?.disabled);
  limit.note.value = user.override?.note || "";
  showDialog(limit.dialog);
}

function parseLimit(value, label) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) throw new Error(`${label} must be a positive number.`);
  return Math.round(numberValue);
}

async function saveLimits() {
  if (!editingUser || !state.user) return;
  limit.error.classList.add("hidden");
  limit.save.disabled = true;
  limit.save.textContent = "Saving…";
  try {
    const payload = {
      quotaSubjectHash: editingUser.quotaSubjectHash,
      clearVideoLimit: limit.clearVideo.checked,
      clearCreditLimit: limit.clearCredit.checked,
      note: limit.note.value.trim(),
      disabled: limit.disabled.checked
    };
    if (!payload.clearVideoLimit) payload.videoLimitOverride = parseLimit(limit.videoLimit.value, "Video clip limit");
    if (!payload.clearCreditLimit) payload.creditLimitOverride = parseLimit(limit.creditLimit.value, "AI credit limit");
    state.dashboard = await api.updateLimits(state.user, payload);
    state.dashboardLoadedAt = Date.now();
    closeDialog(limit.dialog, "saved");
    emit("data", { source: "dashboard" });
    toast("User limits updated. The change is in the audit log.", "ok");
  } catch (error) {
    limit.error.textContent = describeError(error).message;
    limit.error.classList.remove("hidden");
  } finally {
    limit.save.disabled = false;
    limit.save.textContent = "Save limits";
  }
}

// ---------- Finance settings ----------
const fs = {
  dialog: $("#financeSettingsDialog"),
  warning: $("#fsWarning"),
  critical: $("#fsCritical"),
  runwayWarning: $("#fsRunwayWarning"),
  runwayCritical: $("#fsRunwayCritical"),
  spikeMultiplier: $("#fsSpikeMultiplier"),
  spikeMinimum: $("#fsSpikeMinimum"),
  commission: $("#fsCommission"),
  revenueCurrent: $("#fsRevenueCurrent"),
  revenuePrevious: $("#fsRevenuePrevious"),
  revenueCurrentLabel: $("#fsRevenueCurrentLabel"),
  revenuePreviousLabel: $("#fsRevenuePreviousLabel"),
  googleTable: $("#fsGoogleTable"),
  bytePlusRegion: $("#fsBytePlusRegion"),
  error: $("#fsError"),
  save: $("#fsSaveButton")
};

function setInputValue(input, value) {
  input.value = value === null || value === undefined ? "" : String(value);
}

function optionalNumber(input) {
  const value = input.value.trim();
  return value === "" ? null : Number(value);
}

export function openFinanceSettings() {
  const data = state.finance;
  if (!data) {
    toast("Finance settings need the provider monitor, which is not available right now.", "warn");
    return;
  }
  const settings = data.settings;
  setInputValue(fs.warning, settings.thresholds.warningUSD);
  setInputValue(fs.critical, settings.thresholds.criticalUSD);
  fs.dialog.querySelectorAll("[data-threshold]").forEach((input) => {
    setInputValue(input, settings.thresholds.perProvider?.[input.dataset.threshold]?.[input.dataset.level]);
  });
  setInputValue(fs.runwayWarning, settings.runway.warningDays);
  setInputValue(fs.runwayCritical, settings.runway.criticalDays);
  setInputValue(fs.spikeMultiplier, settings.spike.multiplier);
  setInputValue(fs.spikeMinimum, settings.spike.minimumDailyUSD);
  fs.dialog.querySelectorAll("[data-manual]").forEach((input) => {
    const entry = settings.manualBalances?.[input.dataset.manual];
    const value = entry?.[input.dataset.field];
    setInputValue(input, input.dataset.field === "asOf" && value ? String(value).slice(0, 10) : value);
  });
  setInputValue(fs.commission, Math.round(settings.revenue.appleCommissionRate * 100));
  fs.dialog.querySelectorAll("[data-price]").forEach((input) => {
    setInputValue(input, settings.revenue.planPricesUSD?.[input.dataset.price]);
  });
  const current = data.periodKey;
  const previous = previousPeriodKey(current);
  fs.revenueCurrentLabel.textContent = `App Store net proceeds ${current}`;
  fs.revenuePreviousLabel.textContent = `App Store net proceeds ${previous}`;
  setInputValue(fs.revenueCurrent, settings.revenue.manualMonthlyNetUSD?.[current]);
  setInputValue(fs.revenuePrevious, settings.revenue.manualMonthlyNetUSD?.[previous]);
  setInputValue(fs.googleTable, settings.googleBillingExportTable);
  setInputValue(fs.bytePlusRegion, settings.bytePlusBillingRegion);
  fs.error.classList.add("hidden");
  fs.error.textContent = "";
  showDialog(fs.dialog);
}

function collectFinanceSettings() {
  const data = state.finance;
  const settings = data.settings;
  const perProvider = {};
  ["byteplus", "google", "openai"].forEach((id) => {
    const warning = optionalNumber(fs.dialog.querySelector(`[data-threshold="${id}"][data-level="warningUSD"]`));
    const critical = optionalNumber(fs.dialog.querySelector(`[data-threshold="${id}"][data-level="criticalUSD"]`));
    if (warning === null && critical === null) return;
    if (warning === null || critical === null) {
      throw new Error(`Enter both thresholds for ${PROVIDER_NAMES[id]}, or leave both blank to use the default.`);
    }
    perProvider[id] = { warningUSD: warning, criticalUSD: critical };
  });
  const manualBalances = {};
  ["byteplus", "google", "openai"].forEach((id) => {
    const amount = optionalNumber(fs.dialog.querySelector(`[data-manual="${id}"][data-field="amountUSD"]`));
    const asOf = fs.dialog.querySelector(`[data-manual="${id}"][data-field="asOf"]`).value;
    if (amount === null) return;
    if (!asOf) throw new Error(`Add the date the ${PROVIDER_NAMES[id]} balance was read.`);
    manualBalances[id] = { amountUSD: amount, asOf, note: settings.manualBalances?.[id]?.note || "" };
  });
  const planPricesUSD = {};
  fs.dialog.querySelectorAll("[data-price]").forEach((input) => {
    planPricesUSD[input.dataset.price] = optionalNumber(input);
  });
  const manualMonthlyNetUSD = { ...(settings.revenue.manualMonthlyNetUSD || {}) };
  const current = data.periodKey;
  const previous = previousPeriodKey(current);
  [[current, fs.revenueCurrent], [previous, fs.revenuePrevious]].forEach(([period, input]) => {
    const value = optionalNumber(input);
    if (value === null) delete manualMonthlyNetUSD[period];
    else manualMonthlyNetUSD[period] = value;
  });
  const commission = optionalNumber(fs.commission);
  return {
    thresholds: { warningUSD: optionalNumber(fs.warning), criticalUSD: optionalNumber(fs.critical), perProvider },
    runway: { warningDays: optionalNumber(fs.runwayWarning), criticalDays: optionalNumber(fs.runwayCritical) },
    spike: { multiplier: optionalNumber(fs.spikeMultiplier), minimumDailyUSD: optionalNumber(fs.spikeMinimum) },
    revenue: { appleCommissionRate: commission === null ? null : commission / 100, planPricesUSD, manualMonthlyNetUSD },
    manualBalances,
    googleBillingExportTable: fs.googleTable.value.trim(),
    bytePlusBillingRegion: fs.bytePlusRegion.value.trim()
  };
}

async function saveFinanceSettings() {
  if (!state.user || !state.finance) return;
  fs.error.classList.add("hidden");
  let settings;
  try {
    settings = collectFinanceSettings();
  } catch (error) {
    fs.error.textContent = describeError(error).message;
    fs.error.classList.remove("hidden");
    return;
  }
  fs.save.disabled = true;
  fs.save.textContent = "Saving…";
  try {
    state.finance = await api.financeSettings(state.user, settings);
    state.financeError = null;
    state.financeLoadedAt = Date.now();
    closeDialog(fs.dialog, "saved");
    emit("data", { source: "finance" });
    toast("Finance settings saved. Alerts were recomputed.", "ok");
  } catch (error) {
    fs.error.textContent = describeError(error).message;
    fs.error.classList.remove("hidden");
  } finally {
    fs.save.disabled = false;
    fs.save.textContent = "Save settings";
  }
}

export function isEditing() {
  return limit.dialog.open || fs.dialog.open;
}

export function initDialogs() {
  enhanceDialog(limit.dialog);
  enhanceDialog(fs.dialog);
  limit.save.addEventListener("click", saveLimits);
  fs.save.addEventListener("click", saveFinanceSettings);
}
