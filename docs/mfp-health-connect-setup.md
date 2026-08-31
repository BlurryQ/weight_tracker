# MyFitnessPal → Health Connect → Weight Tracker: setup log

Living checklist for the calories feature. Claude built the app-side code; the items below are
the ones that need you, at your laptop or phone.

## Status — all code merged and green (81 tests, tsc + web build clean)

- [x] `src/lib/energy.ts` + tests — maintenance / target-intake math (28-day adaptive TDEE)
- [x] `supabase/migrations/0004_nutrition.sql` — `daily_nutrition` table
- [x] Store wiring — `nutrition` in state, `MERGE_NUTRITION` action, `upsert_nutrition` queue op,
      `daily_nutrition` in api/sync, resume-time Health Connect refresh in AppContext
- [x] History — per-week mean kcal in the row, per-day kcal in the expanded view
- [x] Trends — "Energy balance" card: maintenance, target intake, trim/add vs recent intake
- [x] History copy/paste — `Avg calories` line + per-day `Cals:` line when the week has data
- [x] **Custom Health Connect plugin** — `android/.../HealthConnectPlugin.kt` (Kotlin, ~130 lines),
      registered in `MainActivity.java`; JS bridge in `src/data/healthConnect.ts`
- [x] Android config — `variables.gradle` (minSdk 26), `build.gradle` (Kotlin classpath),
      `app/build.gradle` (Kotlin plugin + `connect-client` + coroutines), `AndroidManifest.xml`
      (READ_NUTRITION, `<queries>`, rationale intent-filters)
- [x] Setup screen — "Calories" section with a Connect button (Android) / "Android only" note (web)
- [ ] **You:** review the Android diffs + Kotlin, then build to a device (steps below)
- [ ] **You:** run migration `0004` in the Supabase SQL editor

## Decision change (2026-08-31)

`@capgo/capacitor-health` was the plan, but its nutrition-capable line (8.x) needs Capacitor 8,
and this project is on Capacitor 7. Upgrading to Cap 8 turned out to mean Node 22 + Android
SDK 36 + Gradle/AGP bumps + a dozen version changes — a toolchain afternoon. Chose instead to
**write our own minimal Kotlin plugin** against `androidx.health.connect:connect-client:1.1.0`,
which builds fine on the current toolchain (compileSdk 35, AGP 8.7.2, JDK 21, Kotlin 1.9.24)
and touches nothing else.

## Your tasks — at the laptop

### 1. Review the changes

- **Kotlin:** `android/app/src/main/java/com/blurryq/weighttracker/HealthConnectPlugin.kt`
  and the `MainActivity.java` one-liner that registers it.
- **Gradle:** `android/build.gradle` (Kotlin classpath), `android/app/build.gradle` (Kotlin
  plugin, `kotlinOptions`, 3 dependency lines), `android/variables.gradle` (`minSdkVersion = 26`).
  `connect-client` is pinned to **1.1.0-alpha12** on purpose — 1.1.0-beta02+ demand compileSdk 36
  and AGP 8.9.1, which would drag in the toolchain upgrade we're avoiding.
- **Manifest:** `android/app/src/main/AndroidManifest.xml` — `READ_NUTRITION` permission,
  `<queries>` for the Health Connect package, and two rationale intent-filters (one on
  MainActivity for Android ≤13, one activity-alias for Android 14+).

### 2. Build to a device

```
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

First build after the Kotlin add will be slower (Gradle pulls the Kotlin toolchain +
`connect-client`). If `./gradlew` complains about the Kotlin plugin version, tell Claude the
exact message.

### 3. On the device

Open the app → **Setup → Calories → Connect** → grant **Nutrition (read)** in the Health
Connect sheet. Recent MyFitnessPal totals should then show on Trends (Energy balance) and in
History. The app re-reads the last 35 days on every resume.

### 4. Run the DB migration

Run `supabase/migrations/0004_nutrition.sql` in the Supabase SQL editor. **Done.**

## Reference

- Estimate math: 28-day rolling window, never spans a Cut↔Bulk change, 3500 kcal/lb, needs
  14+ days of food logs before a number appears.
- Health Connect live data on your account starts **1 Aug 2026**. Health Connect keeps ~30 days
  and MFP syncs forward-only, so anything earlier is gone unless separately imported.
- Optional, personal: `scripts/import-mfp-nutrition.py` can scrape older days straight from the
  MFP web diary into a local `0005_import_nutrition.sql` if you ever want the pre-August
  history. Not part of the feature; not something other users need.
