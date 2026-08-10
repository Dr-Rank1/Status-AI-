# E2EE Rust Bridge (Olm / Megolm)

Production E2EE should use the Matrix **libolm** crate via a Flutter FFI bridge.

## Planned layout

```
mobile/native/e2ee/
├── Cargo.toml          # libolm + flutter_rust_bridge
├── src/lib.rs          # Olm account, outbound/inbound group sessions
└── README.md
```

## Integration steps

1. Add `flutter_rust_bridge` code generation to `pubspec.yaml`.
2. Implement `OlmAccount::create`, `create_outbound_group_session`, and `encrypt`/`decrypt` in Rust.
3. Replace the AES-GCM shim in `lib/services/e2ee_service.dart` with calls to the generated bridge.

The Dart API (`encryptForThread` / `decryptFromThread`) stays stable so backend and UI code do not change.

## Current status

Phase 19 ships a **cryptography**-based client shim so encrypted payloads work end-to-end today. Swap the primitive layer here when libolm is wired up.
