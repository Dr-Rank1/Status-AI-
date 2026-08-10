import 'package:flutter/material.dart';

import '../../models/auth.dart';
import '../../models/session.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/async_state.dart';

class StoreScreen extends StatefulWidget {
  const StoreScreen({
    super.key,
    required this.api,
    required this.currentEnergy,
    required this.onEnergyUpdated,
  });

  final ApiService api;
  final EnergyState currentEnergy;
  final ValueChanged<EnergyState> onEnergyUpdated;

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  late Future<List<StoreProduct>> _productsFuture;
  String? _purchasingId;

  @override
  void initState() {
    super.initState();
    _productsFuture = widget.api.fetchStoreProducts();
  }

  Future<void> _purchase(StoreProduct product) async {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Energy Store')),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            margin: const EdgeInsets.all(16),
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
                      'Current Energy',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: AppColors.textMuted,
                          ),
                    ),
                    Text(
                      '${widget.currentEnergy.remaining} / ${widget.currentEnergy.max}',
                      style: Theme.of(context).textTheme.titleLarge?.copyWith(
                            color: AppColors.energy,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Energy Refills',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: FutureBuilder<List<StoreProduct>>(
              future: _productsFuture,
              builder: (context, snapshot) {
                return AsyncStateView<List<StoreProduct>>(
                  snapshot: snapshot,
                  onRetry: () => setState(() => _productsFuture = widget.api.fetchStoreProducts()),
                  builder: (products) {
                    return ListView.separated(
                      padding: const EdgeInsets.all(16),
                      itemCount: products.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final product = products[index];
                        final loading = _purchasingId == product.id;

                        return Card(
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
                                    onPressed: () => _purchase(product),
                                    child: Text('\$${product.priceUsd.toStringAsFixed(2)}'),
                                  ),
                          ),
                        );
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
