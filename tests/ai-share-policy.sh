#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
manifest=app/src/main/AndroidManifest.xml
provider=app/src/main/java/com/flipyear/album/OriginalShareProvider.java
share=app/src/main/java/com/flipyear/album/OriginalMedia.java
ui=app/src/main/assets/original-media.js

# Read-only provider: not globally exported. Only explicit URI grants are allowed.
grep -F 'android:exported="false" android:grantUriPermissions="true"' "$manifest" >/dev/null
grep -F 'if (!"r".equals(mode))' "$provider" >/dev/null
grep -F 'AlbumArchive.photoId(path.get(1))' "$provider" >/dev/null
grep -F 'Intent.FLAG_GRANT_READ_URI_PERMISSION' "$share" >/dev/null
grep -F 'Intent.EXTRA_STREAM' "$share" >/dev/null
grep -F 'OriginalShareProvider.uri(id)' "$share" >/dev/null
grep -F 'globalThis.PhotoMedia?.shareForEnhancement' "$ui" >/dev/null
grep -F 'AI 高清增强' "$ui" >/dev/null
echo 'AI original-share integration policy checks passed.'
