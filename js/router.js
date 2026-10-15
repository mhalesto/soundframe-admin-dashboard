// Hash router. Routes, filters and the open detail drawer all live in the hash so every view is a link:
//   #users?plan=Go&status=over&user=<quotaSubjectHash>
import { state, emit } from "./store.js";

export const ROUTES = [
  { name: "overview", title: "Overview", group: "Main", icon: "overview", keywords: "home health status summary" },
  { name: "finance", title: "Finance", group: "Main", icon: "finance", keywords: "money revenue spend margin profitability plans cost" },
  { name: "subscribers", title: "Subscribers", group: "Main", icon: "subscribers", keywords: "app store apple paid subscriptions plans linked" },
  { name: "users", title: "Users", group: "Main", icon: "users", keywords: "accounts quota limits overrides" },
  { name: "operations", title: "AI Operations", group: "Operations", icon: "ai", keywords: "jobs models success failures generations queue undelivered" },
  { name: "events", title: "Events", group: "Operations", icon: "events", keywords: "ledger generations activity requests" },
  { name: "providers", title: "Provider Health", group: "Operations", icon: "providers", keywords: "balances runway billing sync byteplus google openai" },
  { name: "audit", title: "Audit", group: "System", icon: "audit", keywords: "log changes history" },
  { name: "access", title: "Access", group: "System", icon: "access", keywords: "uid session admin identity" },
  { name: "settings", title: "Settings", group: "System", icon: "settings", keywords: "preferences thresholds finance settings motion density" }
];

/** Query keys that open a detail drawer rather than filter a page. */
export const DRAWER_KEYS = ["user", "event", "provider", "model", "day", "entry"];

export function routeTitle(name) {
  return ROUTES.find((route) => route.name === name)?.title || "Overview";
}

export function parseHash(hash = location.hash) {
  const text = (hash || "").replace(/^#/, "");
  const [path, query = ""] = text.split("?");
  const name = ROUTES.some((route) => route.name === path) ? path : "overview";
  return { name, params: new URLSearchParams(query) };
}

export function buildHash(name, params) {
  const query = params instanceof URLSearchParams ? params.toString() : new URLSearchParams(params || {}).toString();
  return `#${name}${query ? `?${query}` : ""}`;
}

let pushedDrawer = false;

function apply(options = {}) {
  const previous = state.route;
  state.route = parseHash();
  emit("route", { previous, current: state.route, ...options });
}

export function initRouter() {
  window.addEventListener("hashchange", () => apply());
  state.route = parseHash();
}

export function startRouter() {
  apply({ initial: true });
}

/** Navigate to a route (push) with optional params. */
export function navigate(name, params = {}, { replace = false } = {}) {
  const hash = buildHash(name, params);
  if (hash === location.hash) return;
  if (replace) {
    history.replaceState(null, "", hash);
    apply();
  } else {
    location.hash = hash;
  }
}

/** Update query params on the current route without adding history entries (filters, tabs). */
export function setParams(patch, { replace = true } = {}) {
  const params = new URLSearchParams(state.route.params);
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "" || value === false) params.delete(key);
    else params.set(key, value);
  });
  const hash = buildHash(state.route.name, params);
  if (hash === location.hash) return;
  if (replace) {
    history.replaceState(null, "", hash);
    apply({ paramsOnly: true });
  } else {
    location.hash = hash;
  }
}

export function openDrawerRoute(key, value, routeName = state.route.name) {
  const params = new URLSearchParams(routeName === state.route.name ? state.route.params : "");
  DRAWER_KEYS.forEach((drawerKey) => params.delete(drawerKey));
  params.set(key, value);
  pushedDrawer = true;
  location.hash = buildHash(routeName, params);
}

export function closeDrawerRoute() {
  const hasDrawer = DRAWER_KEYS.some((key) => state.route.params.has(key));
  if (!hasDrawer) return;
  if (pushedDrawer) {
    pushedDrawer = false;
    history.back();
    return;
  }
  const params = new URLSearchParams(state.route.params);
  DRAWER_KEYS.forEach((key) => params.delete(key));
  history.replaceState(null, "", buildHash(state.route.name, params));
  apply({ paramsOnly: true });
}

export function drawerFromParams(params = state.route.params) {
  const key = DRAWER_KEYS.find((drawerKey) => params.has(drawerKey));
  return key ? { kind: key, id: params.get(key) } : null;
}
