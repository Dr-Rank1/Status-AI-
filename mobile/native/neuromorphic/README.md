# Neuromorphic / NPU bridge (Phase 32)

FFI headers: `include/status_neuromorphic.h`  
CPU stub: `src/status_neuromorphic.cpp`  
Dart: `mobile/lib/services/neuromorphic_bridge_service.dart`

## Build

```bash
cd mobile/native/neuromorphic
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
# outputs libstatus_neuromorphic.so / .dylib / .a
```

Link from Flutter via `ffi` or platform channel `com.status/neuromorphic`.

## Backends

| Enum | Target |
|------|--------|
| ANE | Apple Neural Engine |
| HEXAGON | Snapdragon Hexagon |
| NNAPI | Android Neural Networks API |
| LOIHI | Intel Loihi-class |
| CPU | Portable SNN stub (open source default) |

Vendor SDKs replace the stub kernels while keeping the C ABI stable.
