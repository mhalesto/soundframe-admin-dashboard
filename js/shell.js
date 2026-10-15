// Shell: sidebar (expanded / rail / mobile drawer, gliding indicator, badges), top command bar (range, compare,
// refresh status, notifications, profile) and global keyboard shortcuts.
import { state, prefs, savePrefs, on, emit, markRead } from "./store.js";
import { html, timeAgo, initials, authProviderLabel, formatDay } from "./format.js";
import { icon, $, $$, patch, toast, copyText, hideTooltip, prefersReducedMotion } from "./ui.js";
import { openPopover, closePopover, isOpen } from "./popover.js";
import { navigate, routeTitle } from "./router.js";
import { RANGE_PRESETS, resolveRange, buildNotifications, navBadges, anchorDay } from "./data.js";
import { openPalette } from "./palette.js";

const el = {
  app: $("#app"),
  sidebar: $("#sidebar"),
  nav: $("#nav"),
  indicator: $("#navIndicator"),
  scrim: $("#navScrim"),
  collapse: $("#collapseButton"),
  sidebarClose: $("#sidebarClose"),
  menu: $("#menuButton"),
  topbarTitle: $("#topbarTitle"),
  search: $("#searchTrigger"),
  paletteKbd: $("#paletteKbd"),
  rangeButton: $("#rangeButton"),
  rangeLabel: $("#rangeLabel"),
  rangePopover: $("#rangePopover"),
  rangeOptions: $("#rangeOptions"),
  rangeFrom: $("#rangeFrom"),
  rangeTo: $("#rangeTo"),
  rangeApply: $("#rangeApply"),
  rangeHint: $("#rangeHint"),
  compare: $("#compareButton"),
  refreshStatus: $("#refreshStatus"),
  freshness: $("#freshnessText"),
  refresh: $("#refreshButton"),
  progress: $("#topbarProgress"),
  bell: $("#bellButton"),
  bellBadge: $("#bellBadge"),
  notifPanel: $("#notifPanel"),
  notifList: $("#notifList"),
  notifMarkRead: $("#notifMarkRead"),
  profile: $("#profileButton"),
  avatar: $("#avatarInitials"),
  profileMenu: $("#profileMenu"),
  profileHead: $("#profileHead")
};

const mobileQuery = window.matchMedia("(max-width: 900px)");
const railQuery = window.matchMedia("(max-width: 1199px)");
let handlers = { refresh: () => {}, signOut: () => {} };

// ---------- Sidebar ----------
function navItems() {
  return $$(".nav-item[data-route]", el.nav);
}

function moveIndicator({ instant = false } = {}) {
  const active = navItems().find((item) => item.getAttribute("aria-current") === "page");
  if (!active) {
    el.indicator.classList.remove("is-ready");
    return;
  }
  const navRect = el.nav.getBoundingClientRect();
  const rect = active.getBoundingClientRect();
  const y = rect.top - navRect.top + el.nav.scrollTop;
  if (instant || !el.indicator.classList.contains("is-ready")) el.indicator.classList.add("no-transition");
  el.indicator.style.setProperty("--y", `${y}px`);
  el.indicator.style.setProperty("--h", `${rect.height}px`);
  el.indicator.classList.add("is-ready");
  requestAnimationFrame(() => requestAnimationFrame(() => el.indicator.classList.remove("no-transition")));
}

function setActiveNav(name) {
  navItems().forEach((item) => {
    if (item.dataset.route === name) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  el.topbarTitle.textContent = routeTitle(name);
  moveIndicator();
}

function applySidebarPref() {
  const rail = prefs.sidebar === "rail";
  if (rail) document.documentElement.dataset.sidebar = "rail";
  else delete document.documentElement.dataset.sidebar;
  syncCollapseButton();
}

function syncCollapseButton() {
  const condensed = railQuery.matches ? !el.sidebar.classList.contains("is-peek") : prefs.sidebar === "rail";
  el.collapse.setAttribute("aria-label", condensed ? "Expand sidebar" : "Collapse sidebar");
  el.collapse.dataset.tip = condensed ? "Expand sidebar  [" : "Collapse sidebar  [";
  el.collapse.setAttribute("aria-expanded", String(!condensed));
}

function toggleSidebar() {
  if (mobileQuery.matches) {
    if (el.sidebar.classList.contains("is-open")) closeMobileNav();
    else openMobileNav();
    return;
  }
  hideTooltip();
  if (railQuery.matches) {
    // Between 901 and 1199px the rail is fixed; expanding overlays the content instead of reflowing it.
    el.sidebar.classList.toggle("is-peek");
    syncCollapseButton();
    return;
  }
  savePrefs({ sidebar: prefs.sidebar === "rail" ? "expanded" : "rail" });
  applySidebarPref();
}

function openMobileNav() {
  el.sidebar.classList.add("is-open");
  el.scrim.hidden = false;
  requestAnimationFrame(() => el.scrim.classList.add("is-visible"));
  el.menu.setAttribute("aria-expanded", "true");
  document.body.classList.add("is-locked-scroll");
  $(".main-col").inert = true;
  requestAnimationFrame(() => {
    moveIndicator({ instant: true });
    (navItems().find((item) => item.getAttribute("aria-current") === "page") || navItems()[0])?.focus({ preventScroll: true });
  });
}

function closeMobileNav({ restoreFocus = true } = {}) {
  if (!el.sidebar.classList.contains("is-open")) return;
  el.sidebar.classList.remove("is-open");
  el.scrim.classList.remove("is-visible");
  el.menu.setAttribute("aria-expanded", "false");
  document.body.classList.remove("is-locked-scroll");
  $(".main-col").inert = false;
  setTimeout(() => { el.scrim.hidden = true; }, prefersReducedMotion() ? 0 : 280);
  if (restoreFocus) el.menu.focus({ preventScroll: true });
}

function trapMobileNav(event) {
  if (!el.sidebar.classList.contains("is-open") || event.key !== "Tab") return;
  const focusable = $$("a[href], button:not([disabled])", el.sidebar).filter((node) => node.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function renderBadges(notifications = buildNotifications()) {
  const badges = navBadges(notifications);
  $$("[data-badge]", el.nav).forEach((badge) => {
    const entry = badges[badge.dataset.badge];
    badge.classList.toggle("is-visible", Boolean(entry));
    badge.textContent = entry ? String(entry.count) : "";
    if (entry) {
      badge.dataset.tone = entry.tone;
      badge.setAttribute("aria-label", `${entry.count} ${entry.tone === "crit" ? "critical" : entry.tone === "warn" ? "warnings" : "notes"}`);
    } else {
      badge.removeAttribute("aria-label");
    }
  });
}

// ---------- Date range + compare ----------
function renderRangeOptions() {
  const current = prefs.range;
  el.rangeOptions.innerHTML = RANGE_PRESETS.map((preset) => {
    const range = resolveRange(preset.id);
    return html`<button class="range-option" type="button" role="option" aria-selected="${String(current === preset.id)}" data-range="${preset.id}"><span>${preset.label}</span><small>${range.short}</small></button>`.value;
  }).join("");
  const today = anchorDay();
  const earliest = new Date(today.getTime() - 89 * 86400000);
  el.rangeFrom.min = el.rangeTo.min = earliest.toISOString().slice(0, 10);
  el.rangeFrom.max = el.rangeTo.max = today.toISOString().slice(0, 10);
  const active = resolveRange();
  el.rangeFrom.value = prefs.customFrom || active.start.toISOString().slice(0, 10);
  el.rangeTo.value = prefs.customTo || active.end.toISOString().slice(0, 10);
  el.rangeHint.textContent = `Spend history starts ${formatDay(earliest)} (90 days). Event detail covers the newest 80 events.`;
}

export function renderRangeLabel() {
  const range = resolveRange();
  el.rangeLabel.textContent = range.label;
  el.rangeButton.setAttribute("aria-label", `Date range: ${range.label} (${range.short})`);
  el.compare.setAttribute("aria-pressed", String(prefs.compare));
}

// ---------- Refresh status ----------
export function renderFreshness() {
  const loading = state.loading || state.financeLoading;
  el.progress.classList.toggle("is-active", state.loading);
  el.refreshStatus.dataset.auto = prefs.autoRefresh ? "on" : "off";
  el.refresh.disabled = state.loading || state.auth !== "ready";
  const stamp = state.dashboard?.generatedAt ? Date.parse(state.dashboard.generatedAt) : 0;
  const age = stamp ? Date.now() - stamp : Infinity;
  let mode = "idle";
  let text = "Connecting…";
  if (state.auth === "signedout") text = "Signed out";
  else if (state.auth === "locked") text = "Access required";
  else if (loading && !state.dashboard) {
    mode = "loading";
    text = "Loading…";
  } else if (state.lastRefreshFailed) {
    mode = "error";
    text = stamp ? `Refresh failed · data ${timeAgo(stamp)}` : "Refresh failed";
  } else if (loading) {
    mode = "loading";
    text = state.financeLoading && !state.loading ? "Updating providers…" : "Refreshing…";
  } else if (stamp) {
    mode = age > 5 * 60000 ? "stale" : "idle";
    text = `${age > 5 * 60000 ? "Stale · " : "Updated "}${timeAgo(stamp)}`;
  }
  el.refreshStatus.dataset.state = mode;
  if (el.freshness.textContent !== text) el.freshness.textContent = text;
  el.refresh.dataset.tip = `Refresh now (⌘R) · auto-refresh ${prefs.autoRefresh ? "every 45s" : "off"}`;
}

// ---------- Notifications ----------
const SEVERITY_ICON = { critical: ["critical", "crit"], warning: ["alert", "warn"], info: ["info", "info"] };

export function renderNotifications(notifications = buildNotifications()) {
  const unread = notifications.filter((item) => !item.read && item.severity !== "info");
  const unreadCritical = unread.filter((item) => item.severity === "critical").length;
  el.bellBadge.classList.toggle("hidden", unread.length === 0);
  el.bellBadge.textContent = unread.length > 9 ? "9+" : String(unread.length);
  el.bellBadge.dataset.tone = unreadCritical > 0 ? "crit" : "warn";
  el.bell.setAttribute("aria-label", unread.length ? `Notifications, ${unread.length} unread` : "Notifications");
  if (notifications.length === 0) {
    patch(el.notifList, html`<div class="empty compact"><span class="empty-icon">${icon("ok")}</span><strong>All clear</strong><p>No balance, spend, sync, error or access notifications.</p></div>`);
    return;
  }
  const groups = [["critical", "Critical"], ["warning", "Warnings"], ["info", "Updates & notes"]];
  patch(el.notifList, groups.map(([severity, label]) => {
    const items = notifications.filter((item) => item.severity === severity);
    if (!items.length) return "";
    return html`<p class="eyebrow notif-group-label">${label}</p>${items.map((item) => {
      const [glyph, tone] = SEVERITY_ICON[item.severity];
      return html`<button class="notif-item${item.read ? " is-read" : ""}" type="button" data-notif="${item.id}" data-route="${item.route}"><span class="list-icon" data-tone="${tone}">${icon(glyph)}</span><span class="list-main wrap"><strong>${item.title}</strong><span>${item.detail}</span></span><span class="notif-unread" aria-label="${item.read ? "" : "Unread"}"></span></button>`;
    })}`.value;
  }).join(""));
}

// ---------- Profile ----------
export function renderProfile() {
  const user = state.user;
  const label = user?.email || user?.displayName || (user?.isAnonymous ? "Anonymous admin" : "Admin");
  el.avatar.textContent = user ? initials(label) : "··";
  const provider = user?.isAnonymous ? "Anonymous" : authProviderLabel((user?.providerData || []).map((entry) => entry.providerId).join(","));
  const uid = state.status?.uid || user?.uid || "";
  patch(el.profileHead, html`<strong>${label}</strong><span>${provider} · ${state.status?.isAdmin ? "Admin access" : "No admin access"}</span>${uid ? html`<span class="mono">UID ${uid.slice(0, 6)}…${uid.slice(-4)}</span>` : ""}`);
  const auto = el.profileMenu.querySelector('[data-action="toggle-auto"]');
  auto.setAttribute("aria-checked", String(prefs.autoRefresh));
}

// ---------- Keyboard ----------
function isTyping(target) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName));
}

function onKeydown(event) {
  trapMobileNav(event);
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openPalette();
    return;
  }
  if (mod && event.key.toLowerCase() === "r" && !event.shiftKey && state.auth === "ready") {
    // Same as before the redesign: ⌘R refreshes dashboard data instead of reloading the page.
    event.preventDefault();
    handlers.refresh({ force: true });
    return;
  }
  if (event.key === "Escape" && el.sidebar.classList.contains("is-open")) {
    closeMobileNav();
    return;
  }
  if (event.key === "Escape" && el.sidebar.classList.contains("is-peek")) {
    el.sidebar.classList.remove("is-peek");
    syncCollapseButton();
    return;
  }
  if (isTyping(event.target) || mod || event.altKey || document.querySelector("dialog[open]")) return;
  if (event.key === "[") {
    event.preventDefault();
    toggleSidebar();
  } else if (event.key === "/") {
    event.preventDefault();
    openPalette();
  }
}

export function initShell(options) {
  handlers = { ...handlers, ...options };
  applySidebarPref();
  el.paletteKbd.textContent = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";

  el.collapse.addEventListener("click", toggleSidebar);
  el.menu.addEventListener("click", openMobileNav);
  el.sidebarClose.addEventListener("click", () => closeMobileNav());
  el.scrim.addEventListener("click", () => closeMobileNav());
  el.nav.addEventListener("click", (event) => {
    const item = event.target.closest(".nav-item[data-route]");
    if (!item) return;
    hideTooltip();
    if (mobileQuery.matches) closeMobileNav({ restoreFocus: false });
    if (el.sidebar.classList.contains("is-peek")) {
      el.sidebar.classList.remove("is-peek");
      syncCollapseButton();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (el.sidebar.classList.contains("is-peek") && !el.sidebar.contains(event.target)) {
      el.sidebar.classList.remove("is-peek");
      syncCollapseButton();
    }
  });
  el.sidebar.addEventListener("transitionend", (event) => {
    if (event.target === el.sidebar && event.propertyName === "width") {
      moveIndicator({ instant: true });
      emit("layout");
    }
  });
  el.nav.addEventListener("scroll", () => moveIndicator({ instant: true }), { passive: true });
  window.addEventListener("resize", () => {
    if (!mobileQuery.matches) closeMobileNav({ restoreFocus: false });
    if (!railQuery.matches) el.sidebar.classList.remove("is-peek");
    syncCollapseButton();
    moveIndicator({ instant: true });
  });

  el.search.addEventListener("click", () => openPalette());

  el.rangeButton.addEventListener("click", () => {
    renderRangeOptions();
    openPopover(el.rangePopover, el.rangeButton, { align: "end" });
  });
  el.rangeOptions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-range]");
    if (!option) return;
    savePrefs({ range: option.dataset.range });
    closePopover();
  });
  el.rangeApply.addEventListener("click", () => {
    if (!el.rangeFrom.value || !el.rangeTo.value) {
      toast("Choose both a start and an end date.", "warn");
      return;
    }
    savePrefs({ range: "custom", customFrom: el.rangeFrom.value, customTo: el.rangeTo.value });
    closePopover();
  });
  el.compare.addEventListener("click", () => savePrefs({ compare: !prefs.compare }));

  el.refresh.addEventListener("click", () => handlers.refresh({ force: true }));

  el.bell.addEventListener("click", () => {
    renderNotifications();
    openPopover(el.notifPanel, el.bell, { align: "end" });
  });
  el.notifList.addEventListener("click", (event) => {
    const item = event.target.closest("[data-notif]");
    if (!item) return;
    markRead([item.dataset.notif]);
    closePopover({ restoreFocus: false });
    if (item.dataset.route) location.hash = item.dataset.route;
  });
  el.notifMarkRead.addEventListener("click", () => {
    markRead(buildNotifications().map((item) => item.id));
  });

  el.profile.addEventListener("click", () => {
    renderProfile();
    openPopover(el.profileMenu, el.profile, { align: "end" });
  });
  el.profileMenu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-action]");
    if (!item) return;
    const action = item.dataset.action;
    if (action === "toggle-auto") {
      savePrefs({ autoRefresh: !prefs.autoRefresh });
      renderProfile();
      toast(`Auto-refresh ${prefs.autoRefresh ? "on (every 45 seconds while this tab is visible)" : "off"}.`, "info");
      return;
    }
    closePopover({ restoreFocus: false });
    if (action === "copy-uid") copyText(state.status?.uid || state.user?.uid || "", "Admin UID");
    else if (action === "go-access") navigate("access");
    else if (action === "go-settings") navigate("settings");
    else if (action === "sign-out") handlers.signOut();
  });

  document.addEventListener("keydown", onKeydown);
  on("route", ({ current }) => {
    setActiveNav(current.name);
    if (isOpen(el.rangePopover) || isOpen(el.notifPanel) || isOpen(el.profileMenu)) closePopover({ restoreFocus: false });
  });
  on("prefs", (patchPrefs) => {
    if ("sidebar" in patchPrefs) applySidebarPref();
    if ("density" in patchPrefs) document.documentElement.dataset.density = prefs.density;
    if ("motion" in patchPrefs) {
      if (prefs.motion === "system") delete document.documentElement.dataset.motion;
      else document.documentElement.dataset.motion = prefs.motion;
    }
    if ("range" in patchPrefs || "compare" in patchPrefs || "customFrom" in patchPrefs) renderRangeLabel();
    if ("autoRefresh" in patchPrefs) renderFreshness();
  });
  on("notifications-read", () => {
    const list = buildNotifications();
    renderNotifications(list);
    renderBadges(list);
  });
  renderRangeLabel();
  renderFreshness();
  setInterval(renderFreshness, 1000);
}

export { closeMobileNav, moveIndicator };
