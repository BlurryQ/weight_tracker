# Handoff: Weight Tracker (mobile / PWA)

## Overview

A single-purpose weight tracking app for one user running cut/bulk cycles. He weighs in most mornings and judges progress by the **7-day average**, not the daily number. The app must make daily entry trivial, show rolling averages, plot weekly averages with a line of best fit, and answer the question "if this continues, when do I hit X?" in both directions.

Target platform: mobile web / PWA (the user already ships a webpage as an app via Capacitor). A backend will own the data; the prototype uses `localStorage` as a stand-in.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour, not production code to copy. `Weight Tracker App v2.dc.html` uses a small in-house template runtime (`support.js`) and is **not** a React/Vue app you can lift.

**The task is to recreate these designs in the target codebase's environment**, using its established patterns and libraries. If no codebase exists yet, pick the framework you'd want to maintain (React + Vite + TypeScript is a reasonable default for a Capacitor PWA) and implement there. Everything below is written so it can be built without reading the prototype source, but reading it is the fastest way to see interaction details.

## Fidelity

**High fidelity.** Colours, type, spacing and copy below are final. Recreate pixel-accurately at a 390 × 844 logical viewport (iPhone 14/15 class), then let it scale up on larger phones — the layout is a single column with fixed horizontal padding, so it tolerates 360–430 widths without redesign.

Two things are deliberately NOT specified as pixel-perfect: the device bezel (a prototype affordance only — in the real app the content fills the viewport) and the left-hand explanatory panel in the HTML file (scaffolding for review, not part of the app).

---

## Global shell

- **Background** `#0b0c0b` (near-black, warm-neutral). Never pure black.
- **Surface / card** `#131513`. **Raised control** `#1c201b`, hover `#272c26`. **Hairline** `#171a17` / `#191c19`, stronger divider `#1c201b`, chart marker line `#2b302a`.
- **Text** primary `#f2f4ef`, secondary `#e7eae3`, muted `#7a8474`, dim label `#5f655d`, disabled/empty `#3a403a`.
- **Accent (lime)** `oklch(0.82 0.17 128)` — hover/lighter `oklch(0.88 0.17 128)`, text-on-dark variant `oklch(0.86 0.14 128)`, band tints below.
- **Negative / off-phase (red)** `oklch(0.68 0.15 25)`. **Bulk (blue)** `oklch(0.76 0.13 235)`. **Warning amber** `oklch(0.78 0.15 75)`.
- **Content padding** 20px left/right. Safe-area top inset ~58px in the prototype (status bar); use real `env(safe-area-inset-*)`.
- **Scroll**: the whole screen area scrolls vertically under a **sticky bottom bar**; scrollbars hidden. The screen wrapper must not be flex-shrunk — content height has to contribute to scroll height (this was a real bug: `flex: 0 0 auto` on the screen wrapper inside the flex column).

### Typography

Two families, both Google Fonts:

- **Barlow Condensed** (500/600/700) — all numerals, headings, buttons, labels. This is the app's voice: tall condensed figures.
- **IBM Plex Mono** (400/500/600) — metadata, dates, notes, secondary annotations.

Exact styles used (font-weight size/line-height family, letter-spacing):

| Role | Style |
|---|---|
| Hero number | 700 78px/0.8 Barlow Condensed, `-0.01em`, `#f2f4ef` |
| Hero unit | 600 13px/1 Barlow Condensed, `0.12em`, uppercase, `#5f655d` |
| Screen title | 700 25px/1 Barlow Condensed, `0.02em`, uppercase, `#f2f4ef` |
| Section label | 600 9.5px/1 Barlow Condensed, `0.2em`, uppercase, `#5f655d` |
| Card label | 600 9px/1 Barlow Condensed, `0.16em`, uppercase, `#5f655d` |
| Card figure | 700 25px/1 Barlow Condensed, `#e7eae3` |
| Solver output | 700 30px/1 Barlow Condensed |
| Solver input | 700 36px/1 Barlow Condensed |
| Keypad key | 700 21px/1 Barlow Condensed, `#e7eae3` |
| Primary button | 700 13px/1 Barlow Condensed, `0.18em`, uppercase |
| Tab label | 600 10px/1 Barlow Condensed, `0.14em`, uppercase |
| Body meta | 500 10.5px/1 IBM Plex Mono, `#5f655d` |
| Note / caption | 500 10px/1.5 IBM Plex Mono, `#5f655d` |
| History week figure | 700 20px/1 Barlow Condensed, `#e7eae3` |
| History day value | 500 13px/1 IBM Plex Mono |

**Minimum tap target 44px.** Keypad keys are 3-column grid, 8px gap, ~15px vertical padding (≈51px tall). The FAB is 54px.

### Radii & shadow

Cards and controls `14px`. Pills and primary buttons `999px`. Keypad keys `14px`. Small steppers `11–12px`. Sheet top corners `26px`. Only shadow in the app: FAB `0 6px 18px oklch(0.82 0.17 128 / .3)`.

---

## Navigation

Sticky bottom bar, 4 tabs + FAB, all in one flex row (gap 6px, padding `8px 6px 30px`), sitting on a fade `linear-gradient(to bottom, rgba(11,12,11,0) 0%, #0b0c0b 34%)` so content scrolls out under it.

Tabs: **Today · Trends · History · Setup**. Each tab is a 3px × 16px pill above its label: accent lime when active, transparent when not; label `#f2f4ef` active / `#5f655d` inactive.

FAB: 54px lime circle, black plus glyph, opens the entry sheet for **today**. Present on every tab.

Toast: single line above the tab bar, `500 10.5px IBM Plex Mono`, lime, auto-dismiss after 3000ms. Copy examples: `Logged 182.9 lbs`, `Updated Tue 18 Aug · 183.4 lbs`, `Cleared Wed 19 Aug`, `Cut started — week 1`, `Target 175.0 lbs`, `Reset to the CSV import`.

---

## Screen 1 — Today

**Purpose:** the morning glance and the morning entry. Everything he judges by, above the fold.

Top to bottom:

1. **Phase chip** (left) + **date** (right, `500 11px IBM Plex Mono`, `#5c6159`, format `25.08`).
   Chip: pill, `padding 5px 11px`, 5px dot + label `600 10.5px Barlow Condensed / .14em / uppercase`. Copy: `Cut · week 4`. Tapping it navigates to Setup.
   Colours follow the phase direction — Cut: bg `oklch(0.82 0.17 128 / .13)`, border `/.3`, dot lime, text `oklch(0.86 0.14 128)`. Bulk: bg `oklch(0.76 0.13 235 / .14)`, border `/.35`, dot + text blue.

2. **Hero** — `7-DAY AVERAGE` label, then the number at 78px with the unit beside it, then one line of week-over-week: `−1.0 on the week` (`500 11.5px IBM Plex Mono`), coloured by the phase-aware sign rule below.

3. **Pace ring** (right of hero, 72px). Track `#1c201b` 7px; progress arc same width, `stroke-linecap: round`, rotated −90°, `r = 30` (circumference ≈ 188.5). Fill fraction = `clamp(rate / weeklyTarget, 0, 1)`; centre shows the percentage (`700 17px`) over `OF PACE` (`600 7.5px / .14em`). Lime when on pace, amber `oklch(0.78 0.15 75)` when not.

4. **Three stat cards** — `14 DAY`, `30 DAY`, `RATE/WK`. Equal flex, 8px gap, `padding 12px 12px 13px`, radius 14. Rate value is phase-coloured; the two averages are `#e7eae3`.

5. **Chart block** — section label `WEEKLY AVERAGE` with a lime `all trends →` link on the right. Chart spec in its own section below.

6. **Reach card** — the bidirectional solver. Spec below.

## The Reach card (the feature to get right)

Card `#131513`, radius 14, `padding 14px 15px 15px`.

Header row: label `REACH` + a 2-option segmented pill (`SET WEIGHT` / `SET DATE`) on a `#0b0c0b` track, active option filled lime with black text, inactive `#5f655d`.

**Set weight mode** — input is a target weight. Label `TARGET WEIGHT`, value 36px Barlow Condensed with a **dashed underline** `1.5px dashed oklch(0.82 0.17 128 / .6)` and the affordance text `lbs · tap to change`. Tapping opens the keypad sheet in target mode.
Output block (separated by a 1px `#1c201b` rule, 12px above): label `YOU GET THERE`, value = the calendar date (`19 Nov 2026`), sub = `12 weeks away`, note = `From 183.4 lbs at −0.67 lbs/wk.`

**Set date mode** — input is a number of weeks with − / + steppers (38px squares, radius 11, `#1c201b`). Label `IN HOW LONG`, value `7`, unit `weeks` (singular `week` at 1). Range 1–52.
Output: label `YOU WOULD WEIGH`, value `178.7`, sub `lbs on 12 Oct 2026`, same note line.

**Maths** (do this in pounds internally, convert only for display):

```
slope       = least-squares slope over the last 4 weekly averages   // lbs/week
current     = most recent weekly average                            // NOT the 7-day avg
flat        = |slope| < 0.03

// set weight → date
weeks       = (targetLbs - current) / slope
reachable   = !flat && weeks > 0.2 && weeks <= 260
date        = lastMonday + round(weeks) * 7 days

// set date → weight
weight      = current + slope * targetWeeks
date        = lastMonday + targetWeeks * 7 days
```

Empty / edge states, exact copy:
- flat trend, weight mode → value `Flat` in `#7a8474`, note `The last four weeks are flat — no date to give yet.`
- moving away from the target → value `Not on this trend` in red, note `At +0.31 lbs/wk you are moving away from 175.0 lbs.`
- flat trend, date mode → note `Flat trend — that is roughly where you are now.`

**The solver drives the chart.** The dashed projection on the Today chart extends to exactly the number of weeks the solver resolved (clamped 1–52; falls back to 6 when unreachable). Changing the target re-draws the projection. This coupling is the point of the screen — don't decouple them.

---

## Charts (both screens)

Weekly averages only — no daily dots on Today. SVG, no chart library needed.

Geometry: Today `320 × 128` at `left: 28px` (the 28px gutter holds the y labels); Trends `316 × 184` at `left: 32px`. `overflow: visible` so the projection end dot isn't clipped (real bug found in review).

```
show    = last N weekly averages (Today: 26, Trends: window)
slots   = show.length - 1 + projectionWeeks
X(i)    = (i / slots) * W
lo, hi  = min/max of (all points, projected value, fit endpoints) ± 1.2
Y(v)    = H - ((v - lo) / (hi - lo)) * (H - 10) - 3
```

Layers, back to front:

1. **Phase bands** — one `<rect>` per Cut/Bulk span, full height. Cut fill `oklch(0.82 0.17 128 / .05)`, Bulk fill `oklch(0.76 0.13 235 / .07)`; a 1px left edge line at the span start, Cut `oklch(0.82 0.17 128 / .22)`, Bulk `oklch(0.76 0.13 235 / .28)`. Label below the plot in `600 8.5px Barlow Condensed / .14em / uppercase` (Cut `oklch(0.7 0.12 128)`, Bulk blue) — **only if the band is wider than 46px**, and skip bands narrower than 6px entirely.
2. **Gridlines** — 4 (Today) or 5 (Trends) horizontal `#191c19` lines, value labels in the left gutter, `500 9px IBM Plex Mono`, `#5f655d`, integer.
3. **Area** — the line path closed to the baseline, filled with a vertical lime gradient `0.16 → 0` opacity (Trends `0.15 → 0`).
4. **Fit line** — the regression over the fit window, `#7a8474` 1px `dasharray 5 4`. Drawn from `X(n-k)` to `X(n-1)` only — it does not extend past the data.
5. **Data line** — lime, 2.1px, `stroke-linejoin: round`.
6. **Projection** — lime, 2px, `dasharray 2 5`, `linecap round`, `opacity 0.55`. **Anchored at the last actual point**, not at the regression's value there (real bug: using the regression intercept made a flat all-time fit project +7 lbs above current weight). `projected = lastPoint + slope * weeks`.
7. **Dots** — last point 4.5px solid lime; projection end 3.5px, background fill with 1.6px lime stroke (Today) or solid lime (Trends). Trends also shows every weekly point as a 2.4px ring (`#0b0c0b` fill, 1.2px lime stroke).

### Phase bands: how spans are derived

This is the rule the user asked for explicitly. Phase changes are logged as `{ start, name }`. Only **Cut** and **Bulk** create bands; **Deload** and **Maintain** are folded into whatever phase they sit inside, so a cut with a deload in the middle renders as one continuous cut band.

```
spans = []
for each phase change (deduped by ISO week, ascending):
    dir = /bulk/i ? 'Bulk' : /cut/i ? 'Cut' : null
    if (!dir) continue                        // deload / maintain: absorbed
    if (last span has same dir) continue      // merge consecutive
    spans.push({ dir, start: mondayOf(change.start) })
```
Each span runs until the next span's start (last one runs to the final data point).

**Dedupe by ISO week is mandatory** — a phase log that appends unconditionally grows without bound and stacks dozens of identical band edges at one x. Repair on load as well as on write, so any already-polluted stored state self-heals.

---

## Screen 2 — Trends

Title `TRENDS` + `26 weeks shown` on the right. Then:

1. **Chart** (spec above, 184px tall).
2. **Window** row — section label + segmented pill: `8W` / `3M` / `6M` / `ALL` (values 8 / 13 / 26 / 99 weeks). The fit window is `max(4, round(window / 2))` weeks, or the whole log for `ALL`.
3. **Three cards** — `CHANGE` (first→last across the window, phase-coloured), `FIT SLOPE` (`−0.69/wk`, 2dp, phase-coloured), `R²` (2dp, `#e7eae3`).
4. **"If this continues" card** — header label + horizon pill `4W` / `6W` / `12W`, then the projected value at 36px with `lbs by 5 Oct 2026` beside it, then the note: `Fit over the last 13 weeks, R² 0.98. Target −1.00 lbs/wk.`

## Screen 3 — History

Title `HISTORY` + `317 entries`. Hint line: `tap a week to open its days · tap a day to edit`.

**Week row** (card `#131513`, radius 14, `padding 13px 14px`, 8px apart): `WC 24/08` (mono, 74px wide) · weekly average (700 20px, 56px wide) · phase tag (`CUT` / `BULK`, `600 8.5px / .12em`, phase-coloured) · week-over-week delta right-aligned and phase-coloured · caret `▸` / `▾`.

**Expanded**: a detail line (`Cut · 6 of 7 days` — uses the raw phase name, so a deload week reads `Deload · 7 of 7 days`) above a 1px rule, then 7 day rows: day name (40px, lime if today, else `#5f655d`) · value `183.4 lbs` (`#e7eae3`, or `—` and `#3a403a` when unlogged) · right-aligned action `edit` / `add` in lime at 75% opacity. Future days show no action and are not tappable. Tapping a day opens the entry sheet prefilled.

Roughly 2700px of content at 47 weeks — this screen is the reason the scroll container matters.

## Screen 4 — Setup

1. **Current phase** — 2×2 grid of cards. Name (`700 16px / .06em / uppercase`) + hint (`500 9.5px mono`): Cut "deficit, lose steady" · Bulk "surplus, gain slow" · Maintain "hold — folds into phase" · Deload "recover — folds into phase". Selected card: bg `oklch(0.82 0.17 128 / .12)`, 1.5px lime border, title `oklch(0.88 0.14 128)`. Picking a phase logs a change dated today and resets the week counter to 1.
2. **Weekly target** card — value `−1.00 lbs/wk` in lime with − / + steppers (42px, radius 12). Step 0.25 lb (0.1 kg), clamped ±2 lb. Note: `Week 4 of this cut, started Mon 3 Aug. Deloads and maintenance weeks stay inside the cut on the chart.`
3. **Restart** — dashed-border button, `Start this phase again from today (resets week count)`.
4. **Display unit** — segmented `POUNDS` / `KILOS`. Converts every displayed weight and the weekly target; storage stays in pounds.
5. **Sync shape** — mono block showing the payload, plus: `Held in local storage now. One PUT per entry, keyed on date, is enough for a backend to own it.`
6. **Reset to the CSV import** — dashed red-ish (`#3a2b2b` border, `#8a6a6a` text) destructive action.

## Entry sheet (one number)

Bottom sheet over a `rgba(0,0,0,.62)` scrim (tap scrim or `close` to dismiss). Sheet `#131513`, top radius 26, `padding 14px 20px 34px`, 38×4 grabber.

Title: `This morning` for today, `Tue 18 Aug` for a past day, `Target weight` in solver mode. Then a focused field card (`#0b0c0b`, 1.5px lime border, radius 14) with label `WEIGHT` / `REACH THIS WEIGHT` and the value at **46px**; placeholder `—` in `#3a403a`.

Under it: hint `yesterday 183.4 lbs` (or `now 182.0 lbs` in target mode) and, when the day already has an entry, `clear this day` in `#8a6a6a` on the right.

Keypad: 3 × 4 grid, `1-9`, `.`, `0`, `⌫`. Max 5 significant digits, one decimal point. Primary button is disabled-looking (`#1c201b` bg, `#5f655d` text) reading `Enter a weight` until input exists, then lime/black reading `Save` (or `Set target`).

Body fat is **not** collected anywhere. It was in an earlier draft and was removed on purpose.

---

## Interactions & behaviour

- Tab switch is instant, no transition. Sheet appears without animation in the prototype — add a 200–250ms ease-out slide-up if the platform makes it free.
- Hover states only matter for the eventual desktop/dev view: raised controls `#1c201b → #272c26`, lime buttons `oklch(0.82 → 0.88 0.17 128)`, dashed buttons gain a lime border.
- No loading or error states in the prototype. Once a backend exists you'll need: entry-save in flight (optimistic is fine — it's one number), a sync-failed indicator, and a first-run empty state (no entries at all: hide the ring, charts and Reach card, show a single "log your first weigh-in" prompt).
- Validation: weight must parse as a number; anything outside 50–600 lb should be questioned rather than silently stored.
- Responsive: single column, fixed 20px gutters. Nothing needs to reflow below 430px. On tablets, cap the content column at ~430px and centre it rather than stretching.

## State

| State | Type | Notes |
|---|---|---|
| `entries` | `{ date: 'YYYY-MM-DD', lbs: number }[]` | one row per day, sorted ascending, date is the key |
| `screen` | `'today' \| 'trends' \| 'history' \| 'setup'` | |
| `sheet` | `null \| ISO date \| 'target'` | which entry sheet is open |
| `keypadValue` | `string` | raw typed string, parsed on save |
| `phase` | `'Cut' \| 'Bulk' \| 'Maintain' \| 'Deload'` | current |
| `phaseStart` | ISO date | drives the week counter |
| `phaseLog` | `{ start, name }[]` | deduped by ISO week, ascending; drives bands |
| `weeklyTarget` | number (lbs/week) | signed; drives the pace ring |
| `unit` | `'lb' \| 'kg'` | display only |
| `trendWindow` | `8 \| 13 \| 26 \| 99` | weeks |
| `trendHorizon` | `4 \| 6 \| 12` | weeks |
| `openWeek` | ISO Monday or null | History accordion |
| `solveMode` | `'weight' \| 'date'` | Reach card |
| `targetLbs` | number | Reach target weight |
| `targetWeeks` | number | Reach horizon, 1–52 |
| `toast` | string or null | 3s auto-clear |

Everything except `screen` / `sheet` / `toast` persists. The prototype persists to `localStorage` under `wt.v2`; swap for the API and keep a local cache so the app opens instantly offline (it's a PWA — entry must work with no network and sync later).

### Derived values

```
avg(days)        = mean of entries within the last `days` days (missing days simply absent)
weeklyAverages   = group entries by ISO Monday, mean each; weeks with no entries are omitted
weekOverWeek     = avg(7) - avg(7, offset 7)
rate             = least-squares slope over the last 4 weekly averages
pacePercent      = clamp(rate / weeklyTarget, 0, 1.5)
phaseWeek        = floor((today - mondayOf(phaseStart)) / 7 days) + 1
```

### The phase-aware sign rule

Applies to week-over-week, rate/wk, History deltas, and the Trends change/slope cards:

```
if |v| < 0.05           → grey #7a8474
else if phase is Bulk   → v > 0 ? lime : red
else (Cut)              → v < 0 ? lime : red
```
For Maintain/Deload, use the direction of the enclosing Cut/Bulk span (same fold-in rule as the bands), defaulting to Cut.

## Data & assets

- No images, no icon font. Two inline SVGs total: the FAB plus (two rounded rects) and the pace ring. Carets are the text characters `▸` `▾`; backspace is `⌫`.
- `weight-data.js` in this bundle is the user's real history parsed from his spreadsheet: `window.WEIGHT_DATA` = `[{date, w, bf}]` (317 days, Oct 2025 → Aug 2026; `bf` is vestigial — ignore it) and `window.WEIGHT_WEEK_LABELS` = his original week annotations. Useful as a seed/fixture for development and for checking the maths against numbers he recognises.
- Source spreadsheet layout, for reference when importing: one row pair per week (`WC dd/mm`), Monday–Sunday columns.

## Screenshots

`screens/` holds 2× captures of the built prototype (390 × 844 logical, so 780 × 1688 px). Treat them as the visual source of truth alongside the measurements above:

| File | State |
|---|---|
| `01-today.png` | Today, full screen — chip, hero, pace ring, stat cards, chart with Bulk/Cut bands, Reach card in *set weight* mode |
| `02-today-reach-date-mode.png` | Today with Reach switched to *set date* (week stepper + projected weight) |
| `03-trends.png` | Trends — chart, window pill, change/slope/R², "if this continues" card |
| `04-history-week-expanded.png` | History with the top week expanded into its seven days |
| `05-setup.png` | Setup — phase grid, weekly target stepper, unit toggle, sync shape |
| `06-entry-sheet.png` | Entry sheet, empty — note the disabled `ENTER A WEIGHT` button state before input |

The device bezel and status bar in these captures are prototype scaffolding, not part of the app.

## Files in this bundle

| File | What it is |
|---|---|
| `Weight Tracker App v2.dc.html` | **The design.** Final direction, all four screens, fully interactive. |
| `Weight Tracker App.dc.html` | Earlier version that also tracked body fat — reference only, superseded. |
| `Weight Tracker.dc.html` | Three visual directions for the home screen; v2 is a build-out of `1b`. Useful for seeing what was rejected. |
| `weight-data.js` | The user's real 317-day history (see above). |
| `ios-frame.jsx`, `support.js` | Prototype scaffolding — device bezel and the template runtime. **Not part of the app.** |

To view a prototype, open the `.dc.html` file in a browser; the phone bezel is scaffolding, the content inside it is the design.

## Notes for the build

- **PWA**: manifest with a maskable icon, `display: standalone`, `theme-color: #0b0c0b`, and a service worker that caches the shell and queues entries written offline. This is the whole point of the app for him — entry must never fail because the kitchen has no signal.
- Do the arithmetic in pounds and convert at the display boundary. Every kg bug in the prototype came from converting too early.
- Weeks are ISO (Monday-start) everywhere — averages, bands, history grouping, and projection anchoring all key off `mondayOf(date)`.
- The projection anchors to the last **weekly** average, not the 7-day rolling average and not the regression's value. Anchoring anywhere else produces numbers he'll immediately spot as wrong.
