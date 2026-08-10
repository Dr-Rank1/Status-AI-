# Phase 43 — Meta-compiler daemon

Rust crate + C++ ABI for sandboxed self-modifying rewrite proposals.

```bash
# Rust
cd native/meta_compiler && cargo test

# C++ shared lib
cmake -S . -B build && cmake --build build
```

Hot-swap is **denied by default**. Node orchestration:
`backend/src/services/devops/metaCompilerDaemon.js`

Zero-trust deny list includes auth, kill-switch, and governance paths.
