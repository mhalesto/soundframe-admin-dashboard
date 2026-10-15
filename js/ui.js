// DOM helpers shared by the shell and pages: patching, motion, tooltips, toasts, copy, small markup builders.
import { html, raw, escapeHTML, percent } from "./format.js";

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function icon(name, className = "") {
  return raw(`<svg class="icon ${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`);
}

export function prefersReducedMotion() {
  const override = document.documentElement.dataset.motion;
  if (override === "reduced") return true;
  if (override === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Replace an element's markup only when it actually changed (no flicker, focus/hover kept on refresh). */
export function patch(element, markup) {
  if (!element) return false;
  const next = String(markup);
  if (element.__markup === next) return false;
  element.innerHTML = next;
  element.__markup = next;
  return true;
}

/** Stagger rows in when a list's membership/order changes because of a filter or sort (not on refresh). */
export function animateRows(container, selector = "tr, .list-row") {
  if (prefersReducedMotion() || !container) return;
  $$(selector, container).slice(0, 24).forEach((row, index) => {
    row.style.setProperty("--i", index);
    row.classList.remove("is-animating");
    void row.offsetWidth;
    row.classList.add("is-animating");
  });
}

// ---------- Values that count only on load or real change ----------
const shownValues = new Map();

export function setValue(element, key, value, formatter, options = {}) {
  if (!element) return;
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    shownValues.delete(key);
    if (options.pending) {
      element.classList.remove("is-unavailable");
      element.classList.add("is-pending");
      if (!element.querySelector(".sk-inline")) element.innerHTML = '<span class="skeleton sk-inline" aria-label="Loading"></span>';
      return;
    }
    element.classList.remove("is-pending");
    element.textContent = options.unavailable || "Unavailable";
    element.classList.add("is-unavailable");
    return;
  }
  element.classList.remove("is-unavailable", "is-pending");
  const target = Number(value);
  const previous = shownValues.get(key);
  shownValues.set(key, target);
  if (previous === target || prefersReducedMotion()) {
    element.textContent = formatter(target);
    return;
  }
  const from = previous === undefined ? 0 : previous;
  const duration = previous === undefined ? 720 : 520;
  const start = performance.now();
  const token = Symbol("count");
  element.__countToken = token;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const step = (now) => {
    if (element.__countToken !== token) return;
    const progress = Math.min(1, (now - start) / duration);
    const current = from + (target - from) * ease(progress);
    element.textContent = formatter(progress >= 1 ? target : current);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- Tooltips (hover after a short delay, focus immediately) ----------
let tooltipTimer = null;
let tooltipTarget = null;

function railOnly(target) {
  return target.closest(".sidebar") && !isSidebarCondensed();
}

export function isSidebarCondensed() {
  const sidebar = document.getElementById("sidebar");
  return sidebar ? sidebar.getBoundingClientRect().width < 120 : false;
}

function showTooltip(target) {
  const tooltip = document.getElementById("tooltip");
  const text = target.dataset.tip;
  if (!tooltip || !text || railOnly(target)) return;
  tooltip.textContent = text;
  tooltip.hidden = false;
  const rect = target.getBoundingClientRect();
  const inSidebar = Boolean(target.closest(".sidebar"));
  const box = tooltip.getBoundingClientRect();
  let left;
  let top;
  if (inSidebar) {
    tooltip.dataset.side = "right";
    left = target.closest(".sidebar").getBoundingClientRect().right + 8;
    top = rect.top + rect.height / 2 - box.height / 2;
  } else {
    tooltip.dataset.side = "bottom";
    left = Math.min(window.innerWidth - box.width - 8, Math.max(8, rect.left + rect.width / 2 - box.width / 2));
    top = rect.bottom + 8;
  }
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  requestAnimationFrame(() => tooltip.classList.add("is-visible"));
  tooltipTarget = target;
}

export function hideTooltip() {
  clearTimeout(tooltipTimer);
  const tooltip = document.getElementById("tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("is-visible");
  tooltip.hidden = true;
  tooltipTarget = null;
}

export function initTooltips() {
  document.addEventListener("pointerover", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (!target || target === tooltipTarget) return;
    hideTooltip();
    tooltipTimer = setTimeout(() => showTooltip(target), 380);
  });
  document.addEventListener("pointerout", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (target && !target.contains(event.relatedTarget)) hideTooltip();
  });
  document.addEventListener("focusin", (event) => {
    const target = event.target.closest?.("[data-tip]");
    if (target && target.matches(":focus-visible")) showTooltip(target);
  });
  document.addEventListener("focusout", hideTooltip);
  window.addEventListener("scroll", hideTooltip, { passive: true, capture: true });
}

// ---------- Toasts ----------
const TOAST_ICONS = { ok: "ok", warn: "alert", crit: "critical", info: "info" };

export function toast(message, tone = "info", options = {}) {
  const region = document.getElementById("toasts");
  if (!region) return;
  const element = document.createElement("div");
  element.className = "toast";
  element.dataset.tone = tone;
  element.setAttribute("role", tone === "crit" || tone === "warn" ? "alert" : "status");
  element.innerHTML = html`${icon(TOAST_ICONS[tone] || "info")}<div>${message}</div><button class="icon-btn icon-btn-sm" type="button" aria-label="Dismiss">${icon("close")}</button>`.value;
  const remove = () => {
    if (!element.isConnected) return;
    element.classList.add("is-leaving");
    setTimeout(() => element.remove(), prefersReducedMotion() ? 0 : 200);
  };
  element.querySelector("button").addEventListener("click", remove);
  region.appendChild(element);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(remove, options.duration || (tone === "crit" || tone === "warn" ? 7000 : 4200));
}

export async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied to the clipboard.`, "ok");
  } catch (error) {
    toast(`Could not copy. ${error?.message || ""}`, "warn");
  }
}

/** Monospace identifier with a copy button. Never used for secrets. */
export function idChip(value, label = "Identifier", display) {
  if (!value) return html`<span class="faint">—</span>`;
  const shown = display || value;
  return html`<span class="id-chip" title="${value}"><span class="truncate">${shown}</span><button class="copy-btn" type="button" data-copy="${value}" data-copy-label="${label}" aria-label="Copy ${label}">${icon("copy")}</button></span>`;
}

export function initCopyButtons() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    copyText(button.dataset.copy, button.dataset.copyLabel || "Value");
  });
}

// ---------- Segmented controls and tabs with a gliding thumb/ink ----------
export function syncSegmented(container) {
  if (!container) return;
  const active = container.querySelector('[aria-pressed="true"], [aria-selected="true"]');
  let thumb = container.querySelector(".seg-thumb, .tab-ink");
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = container.classList.contains("tabs") ? "tab-ink" : "seg-thumb";
    thumb.setAttribute("aria-hidden", "true");
    container.prepend(thumb);
    thumb.style.transition = "none";
    requestAnimationFrame(() => requestAnimationFrame(() => { thumb.style.transition = ""; }));
  }
  if (!active) {
    thumb.style.opacity = "0";
    return;
  }
  thumb.style.opacity = "1";
  thumb.style.setProperty("--x", `${active.offsetLeft}px`);
  thumb.style.setProperty("--w", `${active.offsetWidth}px`);
}

// ---------- Markup builders ----------
export function emptyState({ iconName = "info", title, body = "", action = "", compact = false }) {
  return html`<div class="empty${compact ? " compact" : ""}"><span class="empty-icon">${icon(iconName)}</span><strong>${title}</strong>${body ? html`<p>${body}</p>` : ""}${action}</div>`;
}

export function callout({ tone = "info", iconName, title = "", body = "", action = "" }) {
  const glyph = iconName || { crit: "critical", warn: "alert", ok: "ok", info: "info" }[tone] || "info";
  return html`<div class="callout" data-tone="${tone}">${icon(glyph)}<div>${title ? html`<strong>${title}</strong>` : ""}${body ? html`<p>${body}</p>` : ""}</div>${action || raw("<span></span>")}</div>`;
}

export function provenance(kind, label, tip = "") {
  return html`<span class="prov prov-${kind}"${tip ? raw(` data-tip="${escapeHTML(tip)}"`) : ""}>${label}</span>`;
}

export function deltaBadge(delta, { goodWhenUp = true, suffix = "" } = {}) {
  if (!delta) return "";
  if (delta.dir === "flat") return html`<span class="delta" data-dir="flat">± 0%${suffix}</span>`;
  const good = delta.dir === "up" ? goodWhenUp : !goodWhenUp;
  const arrow = delta.dir === "up" ? "↑" : "↓";
  const amount = delta.pct === null ? "new" : percent(Math.abs(delta.pct), Math.abs(delta.pct) < 10 ? 1 : 0);
  return html`<span class="delta" data-dir="${delta.dir}" data-good="${String(good)}">${arrow} ${amount}${suffix}</span>`;
}

export function meter(pct, tone = "") {
  return html`<span class="meter-track"><span class="meter-fill"${tone ? raw(` data-tone="${tone}"`) : ""} style="--pct:${Math.max(0, Math.min(100, pct))}%"></span></span>`;
}

export function skeletonPanel(lines = 4, chart = false) {
  return html`<div class="panel"><div class="panel-body" style="display:grid;gap:12px">
    <span class="skeleton sk-line" style="width:32%"></span>
    ${chart ? html`<span class="skeleton sk-chart"></span>` : Array.from({ length: lines }, (_, index) => html`<span class="skeleton sk-row" style="opacity:${1 - index * 0.12}"></span>`)}
  </div></div>`;
}

export function skeletonStrip(cells = 4) {
  return html`<div class="metric-strip" style="--cols:${cells}">${Array.from({ length: cells }, () => html`<div class="metric"><span class="skeleton sk-line" style="width:50%"></span><span class="skeleton sk-value"></span><span class="skeleton sk-line" style="width:70%"></span></div>`)}</div>`;
}

export function pageHeader({ id, title, meta = "", actions = "" }) {
  return html`<header class="page-head">
    <div class="page-head-text">
      <h1 id="title-${id}">${title}</h1>
      <div class="page-meta" data-slot="meta">${meta}</div>
    </div>
    <div class="page-actions" data-slot="actions">${actions}</div>
  </header>`;
}

export function panel({ title, subtitle = "", tools = "", body = "", foot = "", slot = "", bodyClass = "", className = "", id = "" }) {
  return html`<section class="panel ${className}"${id ? raw(` id="${escapeHTML(id)}"`) : ""}>
    <header class="panel-head">
      <div class="panel-title"><h2>${title}</h2>${subtitle ? html`<p${slot ? raw(` data-slot="${escapeHTML(slot)}-sub"`) : ""}>${subtitle}</p>` : ""}</div>
      <div class="panel-tools"${slot ? raw(` data-slot="${escapeHTML(slot)}-tools"`) : ""}>${tools}</div>
    </header>
    <div class="panel-body ${bodyClass}"${slot ? raw(` data-slot="${escapeHTML(slot)}"`) : ""}>${body}</div>
    ${foot ? html`<footer class="panel-foot"${slot ? raw(` data-slot="${escapeHTML(slot)}-foot"`) : ""}>${foot}</footer>` : ""}
  </section>`;
}

export function slot(root, name) {
  return root.querySelector(`[data-slot="${name}"]`);
}
