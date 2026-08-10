import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Wearable / smart-glasses companion mode (Ray-Ban Meta, Android XR, etc.).
class WearablePlatform {
  WearablePlatform._();

  static bool get isWearableMode {
    final env = dotenv.maybeGet('WEARABLE_MODE')?.toLowerCase();
    if (env == 'true' || env == '1') return true;
    return false;
  }

  static bool get preferHudLaunch => isWearableMode;
}
