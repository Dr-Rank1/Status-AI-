# Wearable Native Bridge

Platform-specific hooks for Ray-Ban Meta, Android XR, and other smart glasses.

## Planned integration

```
mobile/native/wearable/
├── android/WearableSyncPlugin.kt   # Companion Mode + BLE GATT server
├── ios/WearableSyncPlugin.swift    # CoreBluetooth peripheral
└── README.md
```

## Flutter entry points

- `WearableHudScreen` — lightweight HUD layout
- `WearableCompanionService` — BLE background sync + ambient notifications
- Set `WEARABLE_MODE=true` in `.env` to launch HUD after login

## BLE service UUID

- Service: `0000status-0000-1000-8000-00805f9b34fb`
- Characteristic: `0000status-0001-1000-8000-00805f9b34fb`

Packets are compact JSON (`v`, `ts`, `energy`, `ambient[]`) under 512 bytes.
