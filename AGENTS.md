@RTK.md

# POS project rules

- After implementing and verifying a completed POS feature, automatically run the project deployment flow without waiting for an extra prompt from the project owner. At minimum, commit and push the scoped diff, deploy changed Supabase functions or migrations when applicable, and install a fresh debug APK when the change affects the tablet app.
- Android debug APK testing should default to a fresh reinstall, because debug signing keys can differ between local builds and GitHub Actions artifacts.
- Use `rtk npm run apk:install:fresh` for local debug builds, or the equivalent `adb uninstall com.scriptcoffeeshop.pos && adb install <path-to-app-debug.apk>` for a downloaded artifact.
- A fresh reinstall removes the existing `com.scriptcoffeeshop.pos` app and clears that app's local data on the tablet. The project owner has stated this is the preferred workflow for this POS prototype; do not propose in-place install as the default.
- If the active agent safety policy requires action-time confirmation before local data deletion, ask only at that exact step before running `adb uninstall`; otherwise proceed with the fresh reinstall workflow directly.
