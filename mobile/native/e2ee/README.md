# Quantum-Resistant E2EE (CRYSTALS-Kyber768)

Phase 22 upgrades DM encryption with **Kyber768** key encapsulation via a Rust FFI bridge.

## Build

```bash
cd mobile/native/e2ee/pq_crypto
chmod +x build.sh
./build.sh
```

Requires Rust toolchain. Produces `libstatus_pq_crypto.so` (Linux).

## Dart integration

- `PqE2eeBridge` — FFI to `status_kyber768_*` functions
- `E2eeService` — hybrid `kyber768+aes-256-gcm` when bridge is loaded

## Algorithm

1. Kyber768 encapsulates a shared secret to the recipient public key
2. Shared secret derives AES-256-GCM session key via SHA-256 KDF
3. Message encrypted with AES-GCM (same API surface as Phase 19)

Register device Kyber public keys: `POST /api/v1/pq/keys`
