import 'package:flutter/material.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

import '../../models/auth.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../services/subscription_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/async_state.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({
    super.key,
    required this.api,
    required this.currentEnergy,
    required this.onEnergyUpdated,
    this.subscription = const SubscriptionState(tier: 'free', isPro: false),
    this.onSubscriptionUpdated,
  });

  final ApiService api;
  final EnergyState currentEnergy;
  final SubscriptionState subscription;
  final ValueChanged<EnergyState> onEnergyUpdated;
  final ValueChanged<SubscriptionState>? onSubscriptionUpdated;

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  late Future<List<StoreProduct>> _productsFuture;
  late Future<List<Package>> _packagesFuture;
  String? _purchasingId;
  bool _purchasingPro = false;

  @override
  void initState() {
    super.initState();
    _productsFuture = widget.api.fetchStoreProducts();
    _packagesFuture = subscriptionService.fetchOfferings();
  }

  Future<void> _purchaseEnergy(StoreProduct product) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        title: const Text('Confirm Purchase'),
        content: Text(
          'Simulated IAP: ${product.label}\n'
          '+${product.amount} energy for \$${product.priceUsd.toStringAsFixed(2)}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Buy')),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _purchasingId = product.id);

    try {
      final result = await widget.api.purchaseEnergy(product.id);
      widget.onEnergyUpdated(result.energy);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('+${result.energyAdded} energy added!'),
          backgroundColor: AppColors.success,
        ),
      );
      Navigator.pop(context);
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.message), backgroundColor: AppColors.like),
      );
    } finally {
      if (mounted) setState(() => _purchasingId = null);
    }
  }

  Future<void> _purchasePro(Package package) async {
    setState(() => _purchasingPro = true);
    try {
      final success = await subscriptionService.purchasePackage(package);
      if (!mounted) return;
      if (success) {
        final entitlements = await widget.api.fetchEntitlements();
        widget.onSubscriptionUpdated?.call(entitlements);
        widget.onEnergyUpdated(
          EnergyState(
            remaining: entitlements.isPro ? 9999 : widget.currentEnergy.remaining,
            max: entitlements.isPro ? 9999 : widget.currentEnergy.max,
            resetAt: widget.currentEnergy.resetAt,
          ),
        );
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Welcome to Status Pro! Unlimited energy & 3D avatars unlocked.'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.pop(context);
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Purchase failed: $e'), backgroundColor: AppColors.like),
      );
    } finally {
      if (mounted) setState(() => _purchasingPro = false);
    }
  }

  Future<void> _restorePurchases() async {
    try {
      await subscriptionService.restorePurchases();
      final entitlements = await widget.api.fetchEntitlements();
      widget.onSubscriptionUpdated?.call(entitlements);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(entitlements.isPro ? 'Pro subscription restored.' : 'No active subscription found.'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Restore failed: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isPro = widget.subscription.isPro || subscriptionService.isPro;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Store'),
        actions: [
          if (SubscriptionService.isSupported)
            TextButton(onPressed: _restorePurchases, child: const Text('Restore')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _EnergyHeader(energy: widget.currentEnergy, isPro: isPro),
          const SizedBox(height: 24),
          if (SubscriptionService.isSupported && !isPro) ...[
            Text(
              'Status Pro',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'Unlimited energy, 3D avatars, and cross-device sync via RevenueCat.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(color: AppColors.textMuted),
            ),
            const SizedBox(height: 12),
            FutureBuilder<List<Package>>(
              future: _packagesFuture,
              builder: (context, snapshot) {
                final packages = snapshot.data ?? [];
                if (packages.isEmpty) {
                  return Card(
                    child: ListTile(
                      leading: const Icon(Icons.workspace_premium, color: AppColors.primary),
                      title: const Text('Status Pro'),
                      subtitle: const Text('Configure offerings in RevenueCat dashboard'),
                      trailing: _purchasingPro
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : null,
                    ),
                  );
                }
                return Column(
                  children: packages.map((pkg) {
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        leading: const Icon(Icons.workspace_premium, color: AppColors.primary),
                        title: Text(pkg.storeProduct.title),
                        subtitle: Text(pkg.storeProduct.description),
                        trailing: _purchasingPro
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : FilledButton(
                                onPressed: () => _purchasePro(pkg),
                                child: Text(pkg.storeProduct.priceString),
                              ),
                      ),
                    );
                  }).toList(),
                );
              },
            ),
            const SizedBox(height: 24),
          ],
          if (isPro)
            Card(
              color: AppColors.primaryMuted.withValues(alpha: 0.3),
              child: const ListTile(
                leading: Icon(Icons.verified, color: AppColors.primary),
                title: Text('Status Pro Active'),
                subtitle: Text('Unlimited energy · 3D avatars enabled'),
              ),
            ),
          Text(
            'Energy Refills',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          FutureBuilder<List<StoreProduct>>(
            future: _productsFuture,
            builder: (context, snapshot) {
              return AsyncStateView<List<StoreProduct>>(
                snapshot: snapshot,
                onRetry: () => setState(() => _productsFuture = widget.api.fetchStoreProducts()),
                builder: (products) {
                  return Column(
                    children: products.map((product) {
                      final loading = _purchasingId == product.id;
                      return Card(
                        margin: const EdgeInsets.only(bottom: 10),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: AppColors.primaryMuted,
                            child: Text('+${product.amount}'),
                          ),
                          title: Text(product.label),
                          subtitle: Text('+${product.amount} energy'),
                          trailing: loading
                              ? const SizedBox(
                                  width: 24,
                                  height: 24,
                                  child: CircularProgressIndicator(strokeWidth: 2),
                                )
                              : FilledButton(
                                  onPressed: isPro ? null : () => _purchaseEnergy(product),
                                  child: Text('\$${product.priceUsd.toStringAsFixed(2)}'),
                                ),
                        ),
                      );
                    }).toList(),
                  );
                },
              );
            },
          ),
        ],
      ),
    );
  }
}

class _EnergyHeader extends StatelessWidget {
  const _EnergyHeader({required this.energy, required this.isPro});

  final EnergyState energy;
  final bool isPro;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          const Icon(Icons.bolt_rounded, color: AppColors.energy, size: 32),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                isPro ? 'Pro Energy (Unlimited)' : 'Current Energy',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(color: AppColors.textMuted),
              ),
              Text(
                isPro ? '∞' : '${energy.remaining} / ${energy.max}',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      color: AppColors.energy,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
