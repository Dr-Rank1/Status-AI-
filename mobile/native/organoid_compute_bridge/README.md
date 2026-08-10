# Phase 43 — Organoid wetware compute bridge (`organoid_compute_bridge`)

Native C ABI for MEA / organoid-intelligence substrates.

## Build

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

## Symbols

| C API | Purpose |
|-------|---------|
| `status_organoid_init` | Select MEA / OI / wetware / sim |
| `status_organoid_spikes_to_sparse` | Bio spikes → sparse tensor |
| `status_organoid_associative_recall` | Hyper-associative memory |

Energy accounting is reported in picojoules (synthetic on sim backends).
