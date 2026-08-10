import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import 'api_service.dart';

/// RevenueCat cross-platform subscription management.
class SubscriptionService {
  SubscriptionService({ApiService? api}) : _api = api;

  ApiService? _api;
  bool _initialized = false;
  CustomerInfo? _customerInfo;
  bool _isPro = false;

  bool get isPro => _isPro;
  CustomerInfo? get customerInfo => _customerInfo;

  static bool get isSupported =>
      !kIsWeb && (Platform.isIOS || Platform.isAndroid);

  Future<void> init({required String userId, ApiService? api}) async {
    if (!isSupported || _initialized) return;
    _api = api ?? _api;

    final apiKey = Platform.isIOS
        ? dotenv.maybeGet('REVENUECAT_IOS_API_KEY')
        : dotenv.maybeGet('REVENUECAT_ANDROID_API_KEY');

    if (apiKey == null || apiKey.isEmpty) {
      debugPrint('[Subscription] RevenueCat API key not configured');
      return;
    }

    await Purchases.setLogLevel(kDebugMode ? LogLevel.debug : LogLevel.warn);
    await Purchases.configure(PurchasesConfiguration(apiKey)..appUserID = userId);

    Purchases.addCustomerInfoUpdateListener(_onCustomerInfoUpdated);
    _customerInfo = await Purchases.getCustomerInfo();
    _updateProStatus(_customerInfo);
    _initialized = true;

    await syncWithBackend();
  }

  Future<List<Package>> fetchOfferings() async {
    if (!_initialized) return [];
    try {
      final offerings = await Purchases.getOfferings();
      return offerings.current?.availablePackages ?? [];
    } catch (_) {
      return [];
    }
  }

  Future<bool> purchasePackage(Package package) async {
    if (!_initialized) return false;
    try {
      final result = await Purchases.purchasePackage(package);
      _customerInfo = result.customerInfo;
      _updateProStatus(_customerInfo);
      await syncWithBackend();
      return _isPro;
    } on PlatformException catch (e) {
      final code = PurchasesErrorHelper.getErrorCode(e);
      if (code == PurchasesErrorCode.purchaseCancelledError) return false;
      rethrow;
    }
  }

  Future<void> restorePurchases() async {
    if (!_initialized) return;
    _customerInfo = await Purchases.restorePurchases();
    _updateProStatus(_customerInfo);
    await syncWithBackend();
  }

  Future<void> syncWithBackend() async {
    if (_api == null) return;
    final entitlements = _customerInfo?.entitlements.active.keys.toList() ?? [];
    try {
      await _api!.syncSubscription(
        appUserId: _customerInfo?.originalAppUserId,
        activeEntitlements: entitlements,
      );
    } catch (_) {}
  }

  void _onCustomerInfoUpdated(CustomerInfo info) {
    _customerInfo = info;
    _updateProStatus(info);
    syncWithBackend();
  }

  void _updateProStatus(CustomerInfo? info) {
    _isPro = info?.entitlements.active.containsKey('pro') == true
        || info?.entitlements.active.containsKey('status_pro') == true;
  }

  /// Apply entitlements returned by backend (webhook sync / session payload).
  void applyBackendEntitlements({required bool isPro}) {
    if (isPro) _isPro = true;
  }
}

final subscriptionService = SubscriptionService();
