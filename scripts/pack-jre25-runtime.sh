#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <repacked-output-dir> [output-zip]" >&2
  exit 1
fi

INPUT_DIR="$1"
OUTPUT_ZIP="${2:-$INPUT_DIR/JRE25.zip}"
UNIVERSAL_ARCHIVE="$INPUT_DIR/universal.tar.xz"
ARM64_ARCHIVE="$INPUT_DIR/bin-arm64.tar.xz"

if [[ ! -f "$UNIVERSAL_ARCHIVE" ]]; then
  echo "Missing archive: $UNIVERSAL_ARCHIVE" >&2
  exit 1
fi

if [[ ! -f "$ARM64_ARCHIVE" ]]; then
  echo "Missing archive: $ARM64_ARCHIVE" >&2
  exit 1
fi

if ! command -v zip >/dev/null 2>&1; then
  echo "'zip' is required to build JRE25.zip" >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
OUTPUT_DIR="$(dirname "$OUTPUT_ZIP")"
OUTPUT_NAME="$(basename "$OUTPUT_ZIP")"
mkdir -p "$OUTPUT_DIR"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

tar -xJf "$UNIVERSAL_ARCHIVE" -C "$STAGE_DIR"
tar -xJf "$ARM64_ARCHIVE" -C "$STAGE_DIR"

rm -f "$OUTPUT_ZIP"
(
  cd "$STAGE_DIR"
  zip -qr "$OUTPUT_NAME" .
)
mv "$STAGE_DIR/$OUTPUT_NAME" "$OUTPUT_ZIP"

echo "Wrote $OUTPUT_ZIP"
