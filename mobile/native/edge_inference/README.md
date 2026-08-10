# INT8 ONNX Edge Models

Quantized on-device models for NPU-accelerated inference.

## Model spec

| Property | Value |
|----------|-------|
| Format | ONNX INT8 |
| Quantization | Post-training INT8 (ONNX Runtime) |
| Target size | < 500 MB |
| Execution providers | CoreML (iOS ANE), NNAPI + Hexagon (Android) |

## Export pipeline

```bash
# 1. Export fine-tuning data (Phase 19)
cd backend && node scripts/export-fine-tuning-data.js

# 2. Fine-tune externally, then quantize:
python -m onnxruntime.quantization.preprocess --input model.onnx --output model_prep.onnx
python -m onnxruntime.quantization.quantize_static --model_input model_prep.onnx \
  --model_output status_dm_int8.onnx --calibration_data_reader reader.py

# 3. Copy to Flutter assets
cp status_dm_int8.onnx ../mobile/assets/models/
```

## Native bridge

Build the ONNX Runtime FFI wrapper:

```bash
cd mobile/native/edge_inference
./build.sh   # links ORT with NNAPI/CoreML EPs
```

## Flutter configuration

```env
EDGE_INFERENCE_ENABLED=true
ONNX_MODEL_PATH=assets/models/status_dm_int8.onnx
```

## Fallback chain

1. ONNX INT8 + NPU (`EdgeInferenceService`)
2. OS native NPU (`flutter_local_ai` — Gemini Nano / Apple Foundation Models)
3. Cloud API (`ApiService` → backend LLM router)
