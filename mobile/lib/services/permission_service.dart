import 'package:flutter/foundation.dart';
import 'package:permission_handler/permission_handler.dart';

class PermissionService {
  Future<void> requestAppPermissions() async {
    if (kIsWeb) return;

    await _request(Permission.notification);
    await _request(Permission.microphone);
    await _request(_photosPermission());
  }

  Future<bool> ensurePhotosAccess() async {
    if (kIsWeb) return true;
    final permission = _photosPermission();
    var status = await permission.status;
    if (status.isGranted || status.isLimited) return true;
    status = await permission.request();
    return status.isGranted || status.isLimited;
  }

  Permission _photosPermission() {
    if (defaultTargetPlatform == TargetPlatform.iOS) {
      return Permission.photos;
    }
    return Permission.photos;
  }

  Future<void> _request(Permission permission) async {
    final status = await permission.status;
    if (status.isGranted || status.isLimited) return;
    await permission.request();
  }
}
