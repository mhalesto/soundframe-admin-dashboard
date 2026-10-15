// Access: the signed-in admin's identity and session, how admin access is granted, and plan defaults.
import { state } from "../store.js";
import { html, formatDateTime, timeAgo, monthLabel, authProviderLabel } from "../format.js";
import { icon, patch, slot, pageHeader, idChip } from "../ui.js";
import { statusPill } from "../views.js";
import { PROJECT_ID, FUNCTIONS_REGION } from "../api.js";

let root;

function layout() {
  return html`
    ${pageHeader({ id: "access", title: "Access" })}
    <div class="grid">
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Current session</h2><p>Who is signed in to this browser</p></div><span data-slot="status"></span></header>
        <div class="panel-body"><dl class="kv-grid" data-slot="session"></dl></div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Data scope</h2><p>What the dashboard is reading</p></div></header>
        <div class="panel-body"><dl class="kv-grid" data-slot="scope"></dl></div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>How admin access works</h2><p>Enforced server-side on every call</p></div></header>
        <div class="panel-body prose">
          <p>Every admin callable re-verifies the Firebase ID token and checks that the UID is listed in <code>SOUNDFRAME_ADMIN_UIDS</code> or carries a <code>soundframeAdmin</code> / <code>admin</code> custom claim. The page is safe to host publicly: it holds no secrets, and nothing here can grant access.</p>
          <p>Prefer Google sign-in for an auditable identity. Anonymous sign-in only works for devices already listed.</p>
        </div>
      </section>
      <section class="panel span-6">
        <header class="panel-head"><div class="panel-title"><h2>Default plan limits</h2><p>Reference · overrides on Users replace these for one subscription</p></div></header>
        <div class="table-scroll"><table class="data-table"><thead><tr><th>Plan</th><th class="num">AI credits / month</th><th class="num">Video clips / month</th></tr></thead>
          <tbody><tr><td>Go</td><td class="num">750</td><td class="num">1</td></tr><tr><td>Pro monthly</td><td class="num">2,500</td><td class="num">4</td></tr><tr><td>Pro 3-month</td><td class="num">3,000</td><td class="num">6</td></tr></tbody></table></div>
        <footer class="panel-foot"><span>Setting a limit to 0 blocks that capability.</span></footer>
      </section>
    </div>`;
}

export default {
  name: "access",
  title: "Access",
  mount(element) {
    root = element;
    patch(root, layout());
  },
  update() {
    const user = state.user;
    const uid = state.status?.uid || user?.uid || "";
    const provider = user?.isAnonymous ? "Anonymous" : authProviderLabel((user?.providerData || []).map((entry) => entry.providerId).join(","));
    patch(slot(root, "meta"), html`<span>Session and permissions</span>`);
    patch(slot(root, "status"), statusPill(state.status?.isAdmin ? "ok" : "crit", state.status?.isAdmin ? "Admin" : "Locked"));
    patch(slot(root, "session"), html`
      <div><dt>Signed in as</dt><dd>${user?.email || user?.displayName || (user?.isAnonymous ? "Anonymous device" : "Firebase Auth user")}</dd></div>
      <div><dt>Auth provider</dt><dd>${provider}</dd></div>
      <div><dt>Firebase UID</dt><dd>${idChip(uid, "Admin UID")}</dd></div>
      <div><dt>Admin status</dt><dd>${state.status?.isAdmin ? "Granted" : "Not granted"}</dd></div>`);
    patch(slot(root, "scope"), html`
      <div><dt>Firebase project</dt><dd><code>${PROJECT_ID}</code> · ${FUNCTIONS_REGION}</dd></div>
      <div><dt>Billing period</dt><dd>${monthLabel(state.dashboard?.periodKey)}</dd></div>
      <div><dt>Event window</dt><dd>Last ${state.dashboard?.eventWindowDays || 14} days · newest 80 events listed</dd></div>
      <div><dt>Dashboard data</dt><dd>${state.dashboard?.generatedAt ? `${formatDateTime(state.dashboard.generatedAt)} · ${timeAgo(state.dashboard.generatedAt)}` : "Not loaded"}</dd></div>
      <div><dt>Provider monitor</dt><dd>${state.finance?.generatedAt ? `${formatDateTime(state.finance.generatedAt)} · ${timeAgo(state.finance.generatedAt)}` : state.financeError ? `Unavailable · ${state.financeError.message}` : "Not loaded"}</dd></div>
      <div><dt>Spend history</dt><dd>${state.finance ? `${state.finance.dataQuality.eventWindowDays} days of events${state.finance.dataQuality.eventsTruncated ? " (truncated)" : ""}` : "—"}</dd></div>`);
  }
};

export { icon };
