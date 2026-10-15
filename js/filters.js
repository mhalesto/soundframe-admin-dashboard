// Universal filter bar: search + "Filter" menu + removable chips. Filter state lives in the hash query, so every
// filtered view (and every drill-down that lands on one) is a shareable link. The search input is rendered once
// and never replaced while typing; only the chip area is re-rendered.
import { html } from "./format.js";
import { icon, $, $$ } from "./ui.js";
import { openPopover, closePopover } from "./popover.js";
import { setParams } from "./router.js";
import { state } from "./store.js";

let menu = null;

function ensureMenu() {
  if (menu) return menu;
  menu = document.createElement("div");
  menu.className = "popover menu filter-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Add filter");
  menu.hidden = true;
  document.body.appendChild(menu);
  return menu;
}

/** Static shell: search field + a slot for chips. */
export function filterBarShell({ searchKey = "q", placeholder = "Search…", slotName = "filters" } = {}) {
  return html`<div class="filter-bar" data-filter-bar data-search-key="${searchKey}">
    <label class="search-field">${icon("search")}<span class="sr-only">${placeholder}</span><input type="search" data-filter-search="${searchKey}" placeholder="${placeholder}" autocomplete="off" spellcheck="false"></label>
    <div class="filter-bar" data-slot="${slotName}"></div>
  </div>`;
}

/** dims: [{ key, label, options: [{ value, label, hint? }] }] */
export function filterChips({ dims = [], params = state.route.params, count = null, total = null, extra = "", searchKey = "q" }) {
  const active = dims.filter((dim) => params.get(dim.key));
  const searchValue = params.get(searchKey) || "";
  const addable = dims.some((dim) => dim.options.length > 0);
  return html`
    ${addable ? html`<button class="control-btn" type="button" data-filter-add aria-haspopup="menu" aria-expanded="false">${icon("filter")}<span>Filter</span></button>` : ""}
    ${active.map((dim) => {
      const value = params.get(dim.key);
      const option = dim.options.find((entry) => String(entry.value) === value);
      return html`<span class="filter-chip"><span class="chip-key">${dim.label}:</span> ${option?.label || value}<button type="button" data-filter-remove="${dim.key}" aria-label="Remove ${dim.label} filter">${icon("close")}</button></span>`;
    })}
    ${active.length > 0 || searchValue ? html`<button class="btn btn-ghost btn-sm" type="button" data-filter-clear>Clear all</button>` : ""}
    ${extra}
    ${count !== null ? html`<span class="result-count" aria-live="polite">${total !== null && total !== count ? `${count} of ${total}` : `${count}`} ${count === 1 ? "result" : "results"}</span>` : ""}
  `;
}

/** Keep the search input in sync with the hash, without disturbing it while the admin types. */
export function syncSearch(root, params = state.route.params) {
  $$("[data-filter-search]", root).forEach((input) => {
    if (document.activeElement === input) return;
    const value = params.get(input.dataset.filterSearch) || "";
    if (input.value !== value) input.value = value;
  });
}

export function bindFilterBar(container, getDims) {
  let timer = null;
  container.addEventListener("input", (event) => {
    const input = event.target.closest("[data-filter-search]");
    if (!input) return;
    clearTimeout(timer);
    const key = input.dataset.filterSearch;
    timer = setTimeout(() => setParams({ [key]: input.value.trim() }), 140);
  });
  container.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-filter-remove]");
    if (remove) {
      setParams({ [remove.dataset.filterRemove]: null });
      requestAnimationFrame(() => $("[data-filter-add]", container)?.focus());
      return;
    }
    if (event.target.closest("[data-filter-clear]")) {
      const bar = event.target.closest("[data-filter-bar]");
      const searchKey = bar?.dataset.searchKey || "q";
      const patch = { [searchKey]: null };
      getDims().forEach((dim) => { patch[dim.key] = null; });
      const input = $("[data-filter-search]", bar || container);
      if (input) input.value = "";
      setParams(patch);
      return;
    }
    const add = event.target.closest("[data-filter-add]");
    if (add) openDimMenu(add, getDims());
  });
}

function openDimMenu(anchor, dims, selectedDim = null) {
  const popover = ensureMenu();
  const params = state.route.params;
  if (!selectedDim) {
    popover.innerHTML = html`<p class="eyebrow" style="padding:6px 10px 4px">Filter by</p>${dims.filter((dim) => dim.options.length > 0).map((dim) => html`<button class="menu-item" role="menuitem" type="button" data-dim="${dim.key}"><span>${dim.label}</span>${params.get(dim.key) ? html`<span class="badge badge-mint">on</span>` : ""}${icon("chevron-right")}</button>`)}`.value;
  } else {
    const current = params.get(selectedDim.key);
    popover.innerHTML = html`<button class="menu-item" role="menuitem" type="button" data-back>${icon("chevron-right", "flip")}<span class="faint">${selectedDim.label}</span></button><div class="menu-sep" role="separator"></div><div class="menu-scroll">${selectedDim.options.map((option) => html`<button class="menu-item" role="menuitemcheckbox" aria-checked="${String(current === String(option.value))}" type="button" data-value="${option.value}"><span>${option.label}</span>${option.hint ? html`<small class="faint">${option.hint}</small>` : ""}${current === String(option.value) ? icon("check") : ""}</button>`)}</div>`.value;
  }
  popover.onclick = (event) => {
    const dimButton = event.target.closest("[data-dim]");
    if (dimButton) {
      openDimMenu(anchor, dims, dims.find((entry) => entry.key === dimButton.dataset.dim));
      return;
    }
    if (event.target.closest("[data-back]")) {
      openDimMenu(anchor, dims);
      return;
    }
    const valueButton = event.target.closest("[data-value]");
    if (valueButton && selectedDim) {
      const value = valueButton.dataset.value;
      closePopover();
      setParams({ [selectedDim.key]: params.get(selectedDim.key) === value ? null : value });
    }
  };
  if (popover.hidden) openPopover(popover, anchor, { align: "start" });
  else $$('[role="menuitem"], [role="menuitemcheckbox"]', popover)[selectedDim ? 1 : 0]?.focus();
}

/** Options list from distinct values, sorted, with optional label mapping. */
export function distinctOptions(values, labelFor = (value) => value) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && value !== "")))
    .sort((lhs, rhs) => String(labelFor(lhs)).localeCompare(String(labelFor(rhs))))
    .map((value) => ({ value: String(value), label: labelFor(value) }));
}

export function matchesSearch(text, query) {
  if (!query) return true;
  const haystack = String(text).toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}
