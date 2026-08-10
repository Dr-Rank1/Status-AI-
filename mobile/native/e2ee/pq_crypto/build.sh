#!/usr/bin/env bash
# Build Kyber768 FFI library for Flutter desktop/mobile targets.
set -euo pipefail
cd "$(dirname "$0")"
cargo build --release
echo "Built: target/release/libstatus_pq_crypto.so (Linux)"
echo "Copy to Flutter jniLibs / platform bundle as needed."
