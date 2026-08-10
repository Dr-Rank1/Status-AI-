import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

import 'local_ai_service.dart';
import 'edge_inference_platform.dart';

/// Hardware-accelerated INT8 edge inference — ONNX Runtime + NPU delegates.
///
/// Priority chain:
/// 1. ONNX INT8 model via NNAPI (Android Hexagon) / CoreML (Apple Neural Engine)
/// 2. OS-native NPU via flutter_local_ai (Gemini Nano / Foundation Models)
/// 3. Cloud fallback (handled by ApiService)
class EdgeInferenceService {
  EdgeInferenceService({LocalAiService? localAi}) : _localAi = localAi ?? LocalAiService();

  final LocalAiService _localAi;
  bool _initialized = false;
  String _activeBackend = 'none';
  bool _npuAvailable = false;

  String get activeBackend => _activeBackend;
  bool get npuAvailable => _npuAvailable;
  bool get isEnabled => dotenv.maybeGet('EDGE_INFERENCE_ENABLED')?.toLowerCase() == 'true';

  Future<void> init() async {
    if (_initialized) return;

    if (await _tryOnnxNpuPath()) {
      _activeBackend = 'onnx_int8_npu';
    } else if (await _localAi.isAvailable) {
      await _localAi.init();
      final info = await _localAi.platformInfo();
      _npuAvailable = info != null;
      _activeBackend = _npuAvailable ? 'os_npu_delegate' : 'os_cpu';
    }

    _initialized = true;
    debugPrint('[EdgeInference] Backend: $_activeBackend npu=$_npuAvailable');
  }

  Future<String?> generateText({
    required String prompt,
    required String instructions,
    int maxTokens = 120,
    double temperature = 0.85,
  }) async {
    await init();

    if (_activeBackend == 'onnx_int8_npu') {
      final result = await _runOnnxInference(prompt, instructions, maxTokens, temperature);
      if (result != null) return result;
    }

    if (await _localAi.isAvailable) {
      return _localAi.generateDmReply(
        characterName: 'Assistant',
        characterBio: instructions,
        userMessage: prompt,
        temperature: temperature,
      );
    }

    return null;
  }

  Future<bool> _tryOnnxNpuPath() async {
    if (!isEnabled) return false;

    final modelPath = dotenv.maybeGet('ONNX_MODEL_PATH')
        ?? 'assets/models/status_dm_int8.onnx';

    if (kIsWeb) return false;

    try {
      // ONNX Runtime with NPU execution provider — native bridge loads at runtime.
      // Placeholder: returns false until native lib is compiled (see native/edge_inference/).
      if (Platform.isAndroid || Platform.isIOS) {
        return await _probeOnnxModel(modelPath);
      }
    } catch (_) {}

    return false;
  }

  Future<bool> _probeOnnxModel(String path) async {
    return EdgeInferencePlatform.probeModel(path);
  }

  Future<String?> _runOnnxInference(
    String prompt,
    String instructions,
    int maxTokens,
    double temperature,
  ) async {
    final modelPath = dotenv.maybeGet('ONNX_MODEL_PATH')
        ?? 'assets/models/status_dm_int8.onnx';
    return EdgeInferencePlatform.generate(
      modelPath: modelPath,
      prompt: prompt,
      instructions: instructions,
      maxTokens: maxTokens,
      temperature: temperature,
    );
  }

  Map<String, dynamic> get diagnostics => {
        'backend': _activeBackend,
        'npuAvailable': _npuAvailable,
        'quantization': 'int8',
        'executionProviders': Platform.isIOS
            ? ['CoreMLExecutionProvider']
            : ['NNAPIExecutionProvider', 'HexagonExecutionProvider'],
      };
}

final edgeInferenceService = EdgeInferenceService();
