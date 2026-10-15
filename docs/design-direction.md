# SoundFrame Admin — design direction

_Internal brief for the operations command-center redesign (October 2026)._

## What the dashboard is for

One operator (the owner) checks, several times a day, whether SoundFrame is healthy and whether it makes money.
The questions come in a fixed order. Is anything on fire, such as an empty provider balance, a failing model or a
negative margin? Where is the money going? Who is using what? What changed? The old dashboard answered them as
eight equal metric cards followed by a 9,000-pixel Finance scroll. The new one answers them in that order, and
nothing is louder than its importance.

## Layout: an "inverted L" command center

- **Sidebar and top bar form the fixed chrome** (Linear's "inverted L"). The sidebar holds navigation. The top bar
  holds everything global: search/command palette, date range plus compare, refresh status, notifications,
  environment and the admin profile.
- **Every page has the same skeleton**: a page header (title, one-line status, scope chips, page actions), then
  one emphasised region, then supporting sections on a 12-column grid. Related numbers share one panel separated
  by hairlines rather than sitting in separate cards.
- **Overview** has a health header, an executive strip and one dominant chart with a "Needs attention" rail beside
  it, then supporting sections (provider spend, model usage, plan mix, users at risk, job health, recent activity).
- **Finance** uses tabs (Spend · Revenue & margin · Plans · Cost detail). The previous single scroll mixed four
  jobs; tabs keep each one on one screen and are deep-linkable (`#finance?tab=plans`).

## Information hierarchy

1. Status: operational state, critical alerts and provider runway.
2. Money: paying subscribers, net revenue, AI spend and gross margin.
3. Volume: active users, generations and success rate.
4. Detail: tables, ledgers and drawers.

Each number carries its **provenance**: _Verified_ (provider billing API), _Estimated_ (SoundFrame's per-generation
list-price record), _Manual_ (entered by an admin), _Unavailable_, _Permission required_, _Sync failed_, _Stale_.
A missing value is never shown as `0`.

## Navigation model

- Grouped sidebar: **Main** (Overview, Finance, Subscribers, Users), **Operations** (AI Operations, Events,
  Provider Health), **System** (Audit, Access, Settings). Each route is backed by data the admin callables already
  return. A separate "Generations" route was not added because it would duplicate the Events ledger, the only
  generation-level data the backend exposes.
- Expanded (248px) and rail (68px) states, animated. A mint indicator glides to the active item. The rail shows
  tooltips. The state is remembered, and `[` toggles it. Below 900px the sidebar becomes a drawer with a dimmed
  backdrop.
- Warning badges on Finance, Provider Health, Users and AI Operations come from the same notification model as
  the bell.
- **⌘K / Ctrl+K command palette**: navigate, search users, events, models and providers, refresh, sync, open
  finance settings, toggle the sidebar, export.
- **Deep links**: the route, filters and the open drawer all live in the hash, for example
  `#users?plan=Go&user=<quotaSubjectHash>`, so a drill-down is a shareable, back-button-friendly URL.

## Visual language (from the app's approved neon-glass system)

- Ground `#0A0C0E`, cards `#16191C`, bars `#121418`, fields `#1E2125`, hairlines at white 6–11%.
- **Mint `#7AE8BB` is the selection colour**: active nav, selected segments, toggles and focus rings.
  **Lavender `#B497FC`** marks secondary actions. **Blue `#80AAFE`** marks links and drill-ins.
- **The ramp (mint→cyan→blue→lavender) appears only on the primary CTA** and in the real SoundFrame logo, as in the
  app. There are no decorative gradients, glows or glass panels.
- Status colours are reserved for status: success `#34C98A`, warning `#F5B83D`, critical `#FF5A5F`. They always
  come with a label or icon.
- Charts use one restrained, brand-derived palette. Providers are BytePlus (mint), Google (blue), OpenAI
  (lavender) and Other (neutral). A comparison period is a dashed neutral line, so there are no rainbow charts.
- Type: the system UI face (SF Pro on Apple devices, as in the app) with tabular figures. Page titles use the
  app's display serif (New York, falling back to Iowan Old Style/Georgia), the same voice as the Studio and
  Settings heroes. IDs are monospaced.
- Desktop density: panels use a 14px radius (the app's 20px is tuned for touch), body text is 13–14px, the
  minimum text size is 11px, and table rows have comfortable and compact densities.

## Motion philosophy

Motion explains change and never decorates. All timing comes from tokens in `css/tokens.css`:
80/140/200/280/400ms durations, an expo-out curve for entrances and a gentle spring for the nav indicator.

- A page enters in about 240ms (opacity plus a 6px rise). The outgoing page is removed instantly, so nothing
  flashes.
- Numbers count up only on first load or when the value really changes. Auto-refresh that brings identical data
  moves nothing.
- Chart instances are reused: refreshes call `update()`, and identical data skips the update entirely.
- Hover lifts by at most 2px. Pressed states scale to 0.98. A pulse appears only on live critical status.
- Drawers slide in from the right (a bottom sheet on phones) over a dimmed backdrop. Toasts rise from the corner.
- Skeletons appear on first load only. Refresh is non-blocking: a hairline progress bar plus a spinning refresh
  icon.
- `prefers-reduced-motion`, or the Settings override, collapses every duration to near zero and disables count-ups
  and chart animation.

## Why this fits SoundFrame

The iOS app's identity is dark ground, hairline cards, mint selection, lavender secondary actions, a gradient only
on the one action that matters, and a serif display voice. That identity carries over directly to a precise
desktop instrument. The dashboard reads as the backstage of the same product, not as a generic blue SaaS template
and not as the mobile UI stretched to 1440px.

## Patterns studied (references only)

- **Linear**: inverted-L chrome, collapsible sidebar with a persisted state and a `[` shortcut, and a command
  menu as the universal entry point.
- **Vercel Observability**: a few top-level metrics that drill down, a preset or custom time range, filters that
  update results live, and lists sortable by error rate.
- **RevenueCat Charts**: subscription metrics with explicit definitions and windows, keeping revenue separate
  from MRR, and stating timezone (UTC) and basis next to each comparison.
- **Stripe Dashboard**: a value plus its comparison-period delta, compare toggles and dense financial tables.
- **Datadog / Sentry**: status colour discipline, an alert inbox with read state, and links from an alert to the
  affected entity.
- **OpenAI usage console**: daily cost stacked by model or provider, and per-model cost tables.
