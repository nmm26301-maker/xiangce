#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?请设置 ANDROID_HOME 指向 Android SDK}"
build_tools="${ANDROID_BUILD_TOOLS:-$ANDROID_HOME/build-tools/35.0.0}"
android_jar="${ANDROID_JAR:-$ANDROID_HOME/platforms/android-35/android.jar}"
rm -rf build/classes build/dex build/compiled build/generated
mkdir -p build/classes build/dex build/compiled build/generated signing
"$build_tools/aapt2" compile --dir app/src/main/res -o build/compiled
"$build_tools/aapt2" link -o build/resources.apk -I "$android_jar" --manifest app/src/main/AndroidManifest.xml -A app/src/main/assets --java build/generated --auto-add-overlay build/compiled/*.flat
java com.sun.tools.javac.Main --release 8 -cp "$android_jar" -d build/classes build/generated/com/flipyear/album/R.java app/src/main/java/com/flipyear/album/*.java
java sun.tools.jar.Main cf build/classes.jar -C build/classes .
"$build_tools/d8" --min-api 26 --lib "$android_jar" --output build/dex build/classes.jar
cp build/resources.apk build/unsigned.apk
(cd build/dex && zip -q -u ../unsigned.apk classes.dex)
"$build_tools/zipalign" -f -p 4 build/unsigned.apk build/aligned.apk
if [[ ! -f signing/flipyear-debug.jks ]]; then
 keytool -genkeypair -keystore signing/flipyear-debug.jks -storepass android -keypass android -alias androiddebugkey -dname 'CN=FlipYear Development' -keyalg RSA -keysize 2048 -validity 10000
fi
version=$(python3 -c 'import xml.etree.ElementTree as E; print(E.parse("app/src/main/AndroidManifest.xml").getroot().get("{http://schemas.android.com/apk/res/android}versionName"))')
apk="FlipYear-v${version}.apk"
"$build_tools/apksigner" sign --ks signing/flipyear-debug.jks --ks-pass pass:android --ks-key-alias androiddebugkey --out "$apk" build/aligned.apk
"$build_tools/apksigner" verify --verbose "$apk"
