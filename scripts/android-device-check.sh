#!/usr/bin/env bash
# Run against one deliberately connected, authorized Android device. Never wipes app data.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v adb >/dev/null || { echo '需要先安装 adb 并连接已授权的安卓设备。' >&2; exit 2; }
adb_device() {
    if [[ -n "${ANDROID_SERIAL:-}" ]]; then command adb -s "$ANDROID_SERIAL" "$@"; else command adb "$@"; fi
}
adb_device get-state >/dev/null
report_dir="${FLIPYEAR_DEVICE_REPORT_DIR:-device-reports/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$report_dir"
adb_device shell getprop ro.product.manufacturer > "$report_dir/manufacturer.txt"
adb_device shell getprop ro.product.model > "$report_dir/model.txt"
adb_device shell getprop ro.build.version.release > "$report_dir/android.txt"
adb_device shell getprop ro.kernel.qemu > "$report_dir/emulator.txt"
adb_device shell dumpsys webviewupdate > "$report_dir/webview.txt"
if [[ "${1:-}" == --install ]]; then
    version=$(python3 -c 'import xml.etree.ElementTree as E; print(E.parse("app/src/main/AndroidManifest.xml").getroot().get("{http://schemas.android.com/apk/res/android}versionName"))')
    adb_device install -r "releases/FlipYear-v${version}.apk"
fi
adb_device shell am start -W -n com.flipyear.album/.MainActivity > "$report_dir/launch.txt"
adb_device shell dumpsys meminfo com.flipyear.album > "$report_dir/memory.txt"
adb_device exec-out screencap -p > "$report_dir/screen.png"
python3 - "$report_dir" <<'PY'
import json, pathlib, sys
pathlib.Path(sys.argv[1], 'results.json').write_text(json.dumps({
    'physicalDeviceVerified': False,
    'note': '设备环境与启动记录，不等同于照片、实况、权限、升级和 GPU 功能通过。',
    'photoImport': '待验证', 'originalExportHash': '待验证', 'motionPlayback': '待验证',
    'webglDrag': '待验证', 'permissionRevoke': '待验证', 'upgrade': '待验证'
}, ensure_ascii=False, indent=2))
PY
echo "设备记录已保存：$report_dir；功能验证状态仍为待验证。"
