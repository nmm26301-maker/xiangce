#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
java com.sun.tools.javac.Main --release 8 -d "$test_dir" app/src/main/java/com/flipyear/album/{WidgetPolicy,MediaPolicy}.java tests/{WidgetPolicyTest,MediaPolicyTest}.java
java -cp "$test_dir" com.flipyear.album.WidgetPolicyTest
java -cp "$test_dir" com.flipyear.album.MediaPolicyTest
