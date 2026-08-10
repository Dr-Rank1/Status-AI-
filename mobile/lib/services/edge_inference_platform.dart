import 'package:flutter/services.dart';

/// Platform channel bridge for ONNX Runtime INT8 inference on device NPUs.
class EdgeInferencePlatform {
  static const MethodChannel _channel = MethodChannel('com.status/edge_inference');

  /// Returns true when an INT8 ONNX model is loadable with NPU execution providers.
  static Future<bool> probeModel(String modelPath) async {
    try {
      final result = await _channel.invokeMethod<bool>('probeModel', {'path': modelPath});
      return result ?? false;
    } on MissingPluginException {
      return false;
    } on PlatformException {
      return false;
    }
  }

  /// Runs INT8 quantized inference via CoreML (iOS) or NNAPI/Hexagon (Android).
  static Future<String?> generate({
    required String modelPath,
    required String prompt,
    required String instructions,
    int maxTokens = 120,
    double temperature = 0.85,
  }) async {
    try {
      final result = await _channel.invokeMethod<String>('generate', {
        'path': modelPath,
        'prompt': prompt,
        'instructions': instructions,
        'maxTokens': maxTokens,
        'temperature': temperature,
      });
      return result;
    } on MissingPluginException {
      return null;
    } on PlatformException {
      return null;
    }
  }

  static Future<Map<String, dynamic>> diagnostics() async {
    try {
      final result = await _channel.invokeMethod<Map>('diagnostics');
      return Map<String, dynamic>.from(result ?? {});
    } catch (_) {
      return {};
    }
  }
}
