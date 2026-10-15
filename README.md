# SoundFrame Admin Dashboard

A static GitHub Pages operations console for SoundFrame. It signs in with Firebase Auth and calls the admin-only
Firebase Functions in `soundframe-ios` (`soundframeAdminStatus`, `soundframeAdminDashboard`,
`soundframeAdminUpdateUserLimits`, `soundframeAdminFinanceMonitor`, `soundframeAdminFinanceSync`,
`soundframeAdminFinanceUpdateSettings`).

## What it does

| Page | What it covers |
|---|---|
| **Overview** | Health status, paying subscribers, net revenue, AI spend and margin, active users, generations, job success and critical alerts. Includes the daily spend chart (date range + compare, click a day for detail), alerts that need action, and supporting sections. |
| **Finance** | Tabs: Spend (by provider, daily/weekly/monthly), Revenue & margin (revenue vs AI cost, tracked vs billed), Plans (profitability, recommendations) and Cost detail (14-day tracked spend, unit economics, undelivered video, cost by user, CSV export). |
| **Subscribers** | Subscribers that Firebase can see this month, the visibility gap for App Store subscribers with no AI activity, and an exact-match lookup of an Apple original transaction ID that runs in the browser. |
| **Users** | Quota management: search, filters, sorting, a detail drawer and override editing (audited). |
| **AI Operations** | Job outcomes per model, a watch list, the model monitoring table (list vs recorded cost, success, capacity) and undelivered video. |
| **Events** | 14-day request/video volume and the generation ledger (newest 80 events), with filters and CSV export. |
| **Provider Health** | Balances (verified / stale / estimated / unavailable), runway, capacity, billing-API access and sync status. |
| **Audit / Access / Settings** | Admin change history, session and access rules, browser preferences and a summary of the finance monitoring settings. |

Global features:
- ⌘K command palette and a notification center.
- Deep links: the hash holds the route, filters and any open drawer, e.g. `#users?status=over&user=<hash>`.
- Expandable/rail sidebar (`[` toggles it).
- Reduced-motion support and responsive layouts from 1440px down to 390px.

## Structure

```
index.html            shell, icons, overlays, quota + finance-settings dialogs
css/tokens.css        design tokens (colour, type, spacing, radii, elevation, motion)
css/base.css          reset, typography, focus, utilities
css/layout.css        sidebar, command bar, page grid, breakpoints
css/components.css    buttons, badges, panels, metric strips, tables, filters, drawer, palette, toasts, forms
css/pages.css         page-specific patterns
js/main.js            boot, auth gates, refresh policy, page lifecycle
js/api.js             Firebase app + admin callables (js/firebase-sdk.js is the only SDK import)
js/store.js           state, preferences, event bus
js/data.js            derived selectors (ranges, notifications, health, badges, subscriber classification)
js/shell.js           sidebar, command bar, notifications, profile, shortcuts
js/router.js          hash routes, params, drawer deep links
js/drawer.js          detail drawers   js/palette.js  command palette   js/filters.js  filter chips
js/dialogs.js         limit + finance settings forms   js/charts.js  Chart.js theme and reuse
js/pages/*.js         one module per page
docs/design-direction.md   design rationale
_dev/                 local preview harness (not published)
```

There is no build step. The page loads the Firebase JS SDK 11.10 from gstatic and Chart.js 4.4.7 from jsdelivr.

## Refresh policy

- The dashboard callable refreshes every 45 seconds while the tab is visible and auto-refresh is on. It pauses while a form is open.
- The provider monitor reads months of events, so it loads on sign-in and on manual refresh. Otherwise it reloads at most every 10 minutes, and only while Finance, Provider Health or AI Operations is open.

## Local preview (no Firebase)

```sh
node _dev/server.mjs        # Node 18+; open http://localhost:4311/
```

The server swaps `js/firebase-sdk.js` for `_dev/firebase-stub.js`, which provides a fake signed-in admin and canned data. Pick a state with `?scenario=`:

| Scenario | Behaviour |
|---|---|
| `signedout` | Sign-in screen |
| `locked` | Signed in without admin access |
| `error` | Dashboard callable fails |
| `empty` | No usage data |
| `nofinance` | Provider monitor not deployed |
| `financedenied` | Provider monitor permission denied |
| `slow` | Callables answer slowly (loading states) |
| `critical` / `healthy` | Alert extremes |

Add `&appstore=waiting` (endpoint deployed, no App Store notification yet) or `&appstore=missing` (App Store functions not deployed) to preview the Subscribers page's other App Store states; the default is live data. Lookup IDs `2000000900000001`–`2000000900000010` match the mock App Store subscriptions.

To regenerate realistic mock data with the real finance computation, build the functions first, then run:

`SOUNDFRAME_FUNCTIONS_LIB=~/Documents/GitHub/soundframe-ios/functions/lib node _dev/make-world.mjs`

## Admin access

The dashboard is safe to host publicly because every privileged operation is checked server-side. A signed-in Firebase UID must either:

- be listed in the `SOUNDFRAME_ADMIN_UIDS` Functions parameter, or
- have a Firebase Auth custom claim of `soundframeAdmin: true` or `admin: true`.

If the dashboard says the current UID is not admin, add that UID in the SoundFrame Functions dotenv file and redeploy:

```sh
cd ~/Documents/GitHub/soundframe-ios
printf '\nSOUNDFRAME_ADMIN_UIDS=PASTE_UID_HERE\n' >> functions/.env.soundframe-1b8d4
npm --prefix functions run build
firebase deploy --only functions --project soundframe-1b8d4
```

If the dotenv file already contains `SOUNDFRAME_ADMIN_UIDS`, edit that line instead of adding a duplicate.

## GitHub Pages

Serve from the repository root on the `main` branch. Jekyll skips the `_dev/` folder.
