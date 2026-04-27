@RTK.md

# POS project rules

- Android debug APK testing should default to a fresh reinstall, because debug signing keys can differ between local builds and GitHub Actions artifacts.
- Use `rtk npm run apk:install:fresh` for local debug builds, or the equivalent `adb uninstall com.scriptcoffeeshop.pos && adb install <path-to-app-debug.apk>` for a downloaded artifact.
- A fresh reinstall removes the existing `com.scriptcoffeeshop.pos` app and clears that app's local data on the tablet. The project owner has stated this is the preferred workflow for this POS prototype; do not propose in-place install as the default.
- If the active agent safety policy requires action-time confirmation before local data deletion, ask only at that exact step before running `adb uninstall`; otherwise proceed with the fresh reinstall workflow directly.
