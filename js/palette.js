// ⌘K / Ctrl+K command palette: navigate, search users, events, models and providers, and run actions.
import { state, prefs, savePrefs, emit } from "./store.js";
import { html, raw, escapeHTML, accountLabel, planLabel, actionLabel, PROVIDER_FULL_NAMES, money, timeAgo } from "./format.js";
import { icon, $, prefersReducedMotion } from "./ui.js";
import { ROUTES, navigate, openDrawerRoute } from "./router.js";
import { users, events, models, providerCards, modelKey, RANGE_PRESETS } from "./data.js";

const el = {
  dialog: $("#palette"),
  input: $("#paletteInput"),
  list: $("#paletteList")
};

let actions = [];
let results = [];
let selected = 0;
let opener = null;

/** Actions are registered by main.js so the palette stays decoupled from the refresh/sync logic. */
export function registerActions(list) {
  actions = list;
}

function score(text, query) {
  if (!query) return 1;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return 1;
  const index = haystack.indexOf(needle);
  if (index === 0) return 100;
  if (index > 0) return 80 - Math.min(index, 40);
  // Every term present (any order)
  const terms = needle.split(/\s+/);
  if (terms.every((term) => haystack.includes(term))) return 50;
  // Subsequence match
  let position = 0;
  for (const char of needle.replace(/\s+/g, "")) {
    position = haystack.indexOf(char, position);
    if (position === -1) return 0;
    position += 1;
  }
  return 20;
}

function highlight(text, query) {
  const needle = (query || "").trim();
  if (!needle) return escapeHTML(text);
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return escapeHTML(text);
  return `${escapeHTML(text.slice(0, index))}<mark>${escapeHTML(text.slice(index, index + needle.length))}</mark>${escapeHTML(text.slice(index + needle.length))}`;
}

function build(query) {
  const groups = [];
  const add = (group, items, limit) => {
    const scored = items
      .map((item) => ({ ...item, score: score(`${item.label} ${item.keywords || ""}`, query) }))
      .filter((item) => item.score > 0)
      .sort((lhs, rhs) => rhs.score - lhs.score)
      .slice(0, query ? limit : Math.min(limit, item_limit_default(group)));
    if (scored.length) groups.push({ group, items: scored, best: scored[0].score });
  };
  add("Navigate", ROUTES.map((route) => ({
    label: route.title, hint: route.group, icon: route.icon, keywords: route.keywords,
    run: () => navigate(route.name)
  })), 10);
  add("Actions", actions.map((action) => ({ ...action, icon: action.icon || "arrow-right" })), 8);
  if (query) {
    add("Users", users().map((user) => ({
      label: accountLabel(user),
      hint: `${planLabel(user.subscriptionProductID)} · ${money(user.providerCostUSD)}`,
      icon: "users",
      keywords: `${user.email} ${user.displayName} ${user.uid} ${user.quotaSubjectHash} ${planLabel(user.subscriptionProductID)} ${user.lastModel}`,
      run: () => openDrawerRoute("user", user.quotaSubjectHash, "users")
    })), 6);
    add("Models", models().map((row) => ({
      label: row.label,
      hint: `${PROVIDER_FULL_NAMES[row.provider] || row.providerName} · ${row.generations30d} in 30d`,
      icon: "ai",
      keywords: `${row.model} ${row.kind} ${row.usedBy} ${row.provider}`,
      run: () => openDrawerRoute("model", modelKey(row), "operations")
    })), 5);
    add("Providers", providerCards().map((card) => ({
      label: card.name,
      hint: card.balance.availableUSD === null ? "Balance unavailable" : `${money(card.balance.availableUSD, { cents: true })} · ${card.status}`,
      icon: "providers",
      keywords: `${card.id} balance runway billing`,
      run: () => openDrawerRoute("provider", card.id, "providers")
    })), 4);
    add("Events", events().map((event) => ({
      label: `${actionLabel(event.action)} · ${event.model || event.provider}`,
      hint: `${money(event.providerCostUSD)} · ${timeAgo(event.createdAt)}`,
      icon: "events",
      keywords: `${event.action} ${event.provider} ${event.model} ${event.uid} ${event.usageKind} ${event.id}`,
      run: () => openDrawerRoute("event", event.id, "events")
    })), 6);
    add("Date range", RANGE_PRESETS.map((preset) => ({
      label: `Range: ${preset.label}`,
      icon: "calendar",
      keywords: "date period time window",
      run: () => savePrefs({ range: preset.id })
    })), 6);
    // Strong matches (substring/word) beat loose subsequence matches, and the best group leads.
    const strongest = Math.max(...groups.map((group) => group.best), 0);
    if (strongest >= 50) {
      groups.forEach((group) => { group.items = group.items.filter((item) => item.score >= 50); });
    }
    return groups.filter((group) => group.items.length).sort((lhs, rhs) => rhs.best - lhs.best);
  }
  return groups;
}

function item_limit_default(group) {
  return group === "Navigate" ? 10 : group === "Actions" ? 8 : 4;
}

function render() {
  const query = el.input.value;
  const groups = build(query);
  results = groups.flatMap((group) => group.items);
  selected = Math.min(selected, Math.max(0, results.length - 1));
  if (results.length === 0) {
    el.list.innerHTML = html`<div class="empty compact"><span class="empty-icon">${icon("search")}</span><strong>No matches for “${query}”</strong><p>Try an email, model, provider, plan or page name.</p></div>`.value;
    el.input.removeAttribute("aria-activedescendant");
    return;
  }
  let index = -1;
  el.list.innerHTML = groups.map((group) => html`<p class="eyebrow palette-group" role="presentation">${group.group}</p>${group.items.map((item) => {
    index += 1;
    return html`<button class="palette-item" type="button" role="option" id="palette-item-${index}" data-index="${index}" aria-selected="${String(index === selected)}">${icon(item.icon)}<span class="palette-label"><span>${raw(highlight(item.label, query))}</span></span>${item.hint ? html`<small>${item.hint}</small>` : html`<span></span>`}</button>`;
  })}`.value).join("");
  el.input.setAttribute("aria-activedescendant", `palette-item-${selected}`);
}

function move(delta) {
  if (!results.length) return;
  selected = (selected + delta + results.length) % results.length;
  el.list.querySelectorAll(".palette-item").forEach((item) => {
    item.setAttribute("aria-selected", String(Number(item.dataset.index) === selected));
  });
  el.input.setAttribute("aria-activedescendant", `palette-item-${selected}`);
  el.list.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
}

function run(index) {
  const item = results[index];
  if (!item) return;
  close(false);
  setTimeout(() => item.run(), 0);
}

export function openPalette(initialQuery = "") {
  if (state.auth !== "ready") return;
  if (el.dialog.open) {
    el.input.select();
    return;
  }
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  el.input.value = initialQuery;
  selected = 0;
  render();
  el.dialog.classList.remove("is-closing");
  el.dialog.showModal();
  el.input.focus();
}

function close(restoreFocus = true) {
  if (!el.dialog.open) return;
  const finish = () => {
    el.dialog.classList.remove("is-closing");
    el.dialog.close();
    if (restoreFocus && opener && document.contains(opener)) opener.focus({ preventScroll: true });
    opener = null;
  };
  if (prefersReducedMotion()) finish();
  else {
    el.dialog.classList.add("is-closing");
    setTimeout(finish, 130);
  }
}

export function initPalette() {
  el.input.addEventListener("input", () => {
    selected = 0;
    render();
  });
  el.input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(selected);
    }
  });
  el.list.addEventListener("click", (event) => {
    const item = event.target.closest(".palette-item");
    if (item) run(Number(item.dataset.index));
  });
  el.list.addEventListener("pointermove", (event) => {
    const item = event.target.closest(".palette-item");
    if (item && Number(item.dataset.index) !== selected) {
      selected = Number(item.dataset.index);
      move(0);
    }
  });
  el.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  el.dialog.addEventListener("click", (event) => {
    if (event.target === el.dialog) close();
  });
}

export { emit, prefs };
