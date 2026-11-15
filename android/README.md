# MindFlow for Android

A standalone Android app: the whole MindFlow web app is bundled inside the APK and
runs on the phone. No laptop or server is needed.

- Maps are stored in the app's private storage (IndexedDB) and work offline.
- The Claude assistant calls the Claude API directly with your own key
  (Claude panel → 🔑). The key never leaves the phone except to call Claude.
- Exports and "Back up all maps" save to **Downloads**; Import restores a backup.
- MCP (Claude Desktop / Claude Code editing your maps) needs the laptop/server
  version; it is not available inside the phone app.

The web app is served from `https://appassets.androidplatform.net/assets/www/` by
`WebViewAssetLoader`, which gives it a secure origin for storage and network calls.
A small JavaScript bridge (`window.MindFlowAndroid`) handles saving files and the
clipboard.

A ready-built APK is at `client/public/MindFlow.apk`.

## Build it yourself

Requires Node 20+, JDK 17+ and the Android SDK (platform 36, build-tools 36).

```bash
npm install
npm run build:mobile -w client        # bundles the web app into android/app/src/main/assets/www
cd android
echo "sdk.dir=/path/to/Android/sdk" > local.properties
gradle assembleRelease
```

Without signing variables the release APK is signed with your debug key. To sign
with your own key:

```bash
keytool -genkeypair -keystore mindflow.jks -alias mindflow -keyalg RSA -keysize 2048 -validity 10000
MINDFLOW_KEYSTORE=$PWD/mindflow.jks MINDFLOW_KEYSTORE_PASSWORD=... gradle assembleRelease
```

The APK is written to `app/build/outputs/apk/release/app-release.apk`. An APK signed
with a different key cannot update an installed one: back up your maps, uninstall the
old app, install the new one, then Import the backup.
