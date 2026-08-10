import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'api_service.dart';
import 'v2_beta_service.dart';

/// Phase 33 — Edge-replicated context hints for spatial / wearable clients.
class EdgeContextService {
  EdgeContextService._();

  static final EdgeContextService instance = EdgeContextService._();

  bool get preferEdge =>
      dotenv.maybeGet('EDGE_VECTOR_READ_PREFERRED')?.toLowerCase() == 'true'
      || V2BetaService.instance.isEnabled;

  Future<Map<String, dynamic>?> fetchEdgeStatus(ApiService api) async {
    if (!V2BetaService.instance.isEnabled) return null;
    try {
      return await api.fetchV2EdgeVectorStatus();
    } catch (_) {
      return null;
    }
  }
}
