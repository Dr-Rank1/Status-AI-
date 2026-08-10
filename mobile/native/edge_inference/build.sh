#!/usr/bin/env bash
# Build ONNX Runtime FFI wrapper with NPU execution providers.
# Requires: cmake, Android NDK (Android), Xcode (iOS)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ORT_VERSION="${ORT_VERSION:-1.19.2}"

echo "==> Status Edge Inference — ONNX Runtime ${ORT_VERSION}"
echo "    iOS EP: CoreMLExecutionProvider (Apple Neural Engine)"
echo "    Android EP: NNAPIExecutionProvider + HexagonExecutionProvider"

mkdir -p "${ROOT}/build"

cat > "${ROOT}/build/README.txt" <<EOF
Native ONNX bridge placeholder.

To enable NPU inference:
1. Download ONNX Runtime ${ORT_VERSION} prebuilt for iOS/Android
2. Link against libonnxruntime with CoreML/NNAPI execution providers
3. Register MethodChannel handlers in:
   - android/.../EdgeInferencePlugin.kt
   - ios/Runner/EdgeInferencePlugin.swift

See mobile/native/edge_inference/README.md for quantization pipeline.
EOF

echo "==> Stub build complete. Register platform channel 'com.status/edge_inference' in native code."
