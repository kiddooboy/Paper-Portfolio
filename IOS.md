# Building the iOS app without a Mac (Codemagic)

Codemagic runs Xcode on a cloud Mac and builds your iOS app straight from this
GitHub repo. The build pipeline is in [`codemagic.yaml`](./codemagic.yaml).

There are **two workflows**:
- **`ios-compile-check`** — confirms the iOS app *compiles* (no Apple account
  needed). Good first sanity check.
- **`ios-release`** — produces a signed app and uploads it to **TestFlight**
  (requires the Apple Developer Program, $99/yr).

---

## Step 0 — What you need
- A free **Codemagic** account (codemagic.io) — connect with GitHub.
- For TestFlight/App Store: **Apple Developer Program** membership ($99/yr).
- The repo pushed to GitHub (it is).

---

## Step 1 — First, just check it compiles (free)
1. Sign in to Codemagic → **Add application** → pick this GitHub repo →
   it detects `codemagic.yaml`.
2. Run the **`ios-compile-check`** workflow.
3. If it goes green, the iOS app builds cleanly. 🎉 (You can't install this one
   on a phone — it's only a compile test.)

---

## Step 2 — Register the iOS app in Firebase (for Google sign-in)
1. Firebase Console → **Project settings → Add app → iOS**.
2. **iOS bundle ID:** `in.paperportfolio.app` (same as Android).
3. Download **`GoogleService-Info.plist`**.
4. Put it in the repo at **`client/ios-config/GoogleService-Info.plist`** and
   commit + push. (It's public client config — safe to commit, like the
   Android `google-services.json`. The build copies it into the iOS project.)

---

## Step 3 — Connect your Apple Developer account to Codemagic
1. In Codemagic → **Teams / Settings → Integrations → App Store Connect**.
2. Create an **App Store Connect API key** (App Store Connect → Users and
   Access → Integrations → App Store Connect API → generate a key with
   "App Manager" role). Upload the `.p8` + Issuer ID + Key ID to Codemagic.
3. **Name the integration exactly:** `PaperPortfolioAppStoreKey`
   (that's what `codemagic.yaml` references).
4. Create the app record once in **App Store Connect** (My Apps → +) with
   bundle id `in.paperportfolio.app`, name "Paper Portfolio".

Codemagic's **automatic signing** (`ios_signing` in the yaml) will then create
and manage the certificates/profiles for you — no manual cert wrangling.

---

## Step 4 — Build & ship to TestFlight
1. Run the **`ios-release`** workflow in Codemagic.
2. It builds a signed `.ipa` and uploads it to **TestFlight**.
3. In App Store Connect → **TestFlight**, add yourself/testers and install via
   the **TestFlight app** on the iPhone.

> iOS has no "APK you tap to install". Testing happens through TestFlight; public
> release happens through the App Store (Product → submit for review).

---

## Notes
- The **same** web code, auth, and `@capacitor-firebase/authentication` plugin
  power both Android and iOS — no app-code changes needed.
- iOS uses the native Google sign-in flow (no "Credential Manager" issue).
- The server (EC2) is unchanged — it verifies Firebase tokens from any platform.
- `client/ios/` is generated on the Mac runner each build (not committed), just
  like `client/android/`'s web assets.
- Bump nothing manually — the pipeline sets the build number from App Store Connect.

## Alternatives to Codemagic
- **A real Mac** (or rented cloud Mac: MacinCloud / AWS EC2 Mac): run
  `npm i && npm run build && npx cap add ios && npx cap open ios`, then build in
  Xcode. Same result, hands-on.
- **GitHub Actions** macOS runner — possible but you manage signing yourself
  (Codemagic's guided signing is much easier for a first-timer).
