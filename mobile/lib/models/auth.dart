import 'session.dart';

class AuthResult {
  const AuthResult({
    required this.user,
    required this.token,
    required this.energy,
  });

  final SessionUser user;
  final String token;
  final EnergyState energy;

  AppSession get session => AppSession(user: user, energy: energy);

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    final energyJson = json['energy'] as Map<String, dynamic>?;
    return AuthResult(
      user: SessionUser.fromJson(json['user'] as Map<String, dynamic>),
      token: json['token'] as String,
      energy: energyJson != null
          ? EnergyState.fromJson(energyJson)
          : EnergyState(
              remaining: 100,
              max: 100,
              resetAt: DateTime.now().add(const Duration(hours: 24)),
            ),
    );
  }
}

class StoreProduct {
  const StoreProduct({
    required this.id,
    required this.label,
    required this.amount,
    required this.priceUsd,
  });

  final String id;
  final String label;
  final int amount;
  final double priceUsd;

  factory StoreProduct.fromJson(Map<String, dynamic> json) {
    return StoreProduct(
      id: json['id'] as String,
      label: json['label'] as String,
      amount: json['amount'] as int,
      priceUsd: (json['priceUsd'] as num).toDouble(),
    );
  }
}

class RefillResult {
  const RefillResult({required this.energy, required this.energyAdded});

  final EnergyState energy;
  final int energyAdded;

  factory RefillResult.fromJson(Map<String, dynamic> json) {
    return RefillResult(
      energy: EnergyState.fromJson(json['data'] as Map<String, dynamic>),
      energyAdded: json['energyAdded'] as int? ?? 0,
    );
  }
}
