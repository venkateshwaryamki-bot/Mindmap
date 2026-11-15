# MindFlow for Android

A small native Android app (no extra libraries, ~40 KB) that opens your MindFlow server
full screen. On first launch it asks for the server address and remembers it.

- Laptop on your Wi-Fi: type the "On your Wi-Fi" address MindFlow prints, e.g. `192.168.1.20:8787`
- Hosted MindFlow: type its `https://…` address
- Change it later: ☰ → **Change server**

The app adds what a plain browser tab cannot: exports (PNG, Markdown, JSON) save to
your **Downloads** folder, "Copy outline" uses the Android clipboard, file import opens
the Android file picker, and the Back button closes open panels before leaving.

A ready-built APK is at `client/public/MindFlow.apk`, and every running MindFlow
server serves it at `/MindFlow.apk`.

## Build it yourself

Requires JDK 17+ and the Android SDK (platform 36, build-tools 36).

```bash
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

The APK is written to `app/build/outputs/apk/release/app-release.apk`.
An APK signed with a different key cannot update an installed one; uninstall the old
app first (your maps live on the server, so nothing is lost).
