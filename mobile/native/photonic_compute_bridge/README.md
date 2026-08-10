# Phase 42 — Photonic compute bridge (`photonic_compute_bridge`)

Native C++ bindings for optical AI processing units (OPUs) and silicon photonics.

## Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## FFI (Flutter)

Channel / DynamicLibrary name: `status_photonic`  
Dart wrapper: `mobile/lib/services/photonic_compute_bridge_service.dart`

## Symbols

| C API | Purpose |
|-------|---------|
| `status_photonic_init` | Select OPU / MZI / CPU-sim backend |
| `status_photonic_matmul` | Optical matrix multiply |
| `status_photonic_vector_search` | Spatial cosine top-1 |
| `status_photonic_decode_intent` | Multi-agent intent decode |

Open-source builds use a CPU optical simulator; vendor SDKs replace kernels at link time.
