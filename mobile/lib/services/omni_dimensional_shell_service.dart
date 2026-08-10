import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Phase 50 — Omni-dimensional UI epoch shells.
enum OmniShellMode {
  /// Full Status app (default production).
  status,

  /// Phase 1 minimal Hello World condensation.
  phase1,

  /// Phase 25 white-label theme dashboard shell.
  phase25,

  /// Phase 48 multiversal reality canvas shell.
  phase48,
}

/// Persists developer/user meta-toggle across app launches.
class OmniDimensionalShellService {
  OmniDimensionalShellService._();

  static final OmniDimensionalShellService instance = OmniDimensionalShellService._();

  static const _storageKey = 'status_omni_shell_mode';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  OmniShellMode _mode = OmniShellMode.status;
  bool _loaded = false;

  OmniShellMode get mode => _mode;

  Future<void> load() async {
    if (_loaded) return;
    final stored = await _storage.read(key: _storageKey);
    if (stored != null) {
      _mode = OmniShellMode.values.firstWhere(
        (m) => m.name == stored,
        orElse: () => OmniShellMode.status,
      );
    } else {
      final env = (dotenv.maybeGet('OMNI_SHELL_MODE') ?? '').toLowerCase();
      _mode = switch (env) {
        'phase1' || '1' => OmniShellMode.phase1,
        'phase25' || '25' => OmniShellMode.phase25,
        'phase48' || '48' => OmniShellMode.phase48,
        _ => OmniShellMode.status,
      };
    }
    // Legacy Phase 49 flag still honored for phase1 shell.
    final condense = (dotenv.maybeGet('OUROBOROS_CONDENSE') ?? '').toLowerCase();
    if ((_mode == OmniShellMode.status) && (condense == '1' || condense == 'true')) {
      _mode = OmniShellMode.phase1;
    }
    _loaded = true;
    debugPrint('[OmniShell] mode=${_mode.name}');
  }

  Future<void> setMode(OmniShellMode mode) async {
    _mode = mode;
    await _storage.write(key: _storageKey, value: mode.name);
    debugPrint('[OmniShell] set mode=${mode.name}');
  }
}
