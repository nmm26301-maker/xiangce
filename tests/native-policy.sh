#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
java com.sun.tools.javac.Main --release 8 -d "$test_dir" app/src/main/java/com/flipyear/album/{WidgetPolicy,MediaPolicy,AlbumArchive,MotionPhoto,OriginalBytes,PhotoRegionPlan}.java tests/{WidgetPolicyTest,MediaPolicyTest,AlbumArchiveTest,MotionPhotoTest,OriginalBytesTest,PhotoRegionPlanTest}.java
java -cp "$test_dir" com.flipyear.album.WidgetPolicyTest
java -cp "$test_dir" com.flipyear.album.MediaPolicyTest
java -Xmx256m -cp "$test_dir" com.flipyear.album.AlbumArchiveTest

java -Xmx128m -cp "$test_dir" com.flipyear.album.MotionPhotoTest

java -Xmx128m -cp "$test_dir" com.flipyear.album.OriginalBytesTest

java -cp "$test_dir" com.flipyear.album.PhotoRegionPlanTest
