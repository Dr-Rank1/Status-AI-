#pragma once
/**
 * Phase 32 — Neuromorphic / NPU bridge (flutter_neuromorphic_bridge)
 *
 * Spiking neural network (SNN) kernels for ambient voice + gesture on-device.
 * Target: sub-millisecond inference on Apple Neural Engine / Hexagon / Loihi-class NPUs.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_NEURO_OK = 0,
  STATUS_NEURO_ERR_INIT = 1,
  STATUS_NEURO_ERR_UNSUPPORTED = 2,
  STATUS_NEURO_ERR_TIMEOUT = 3,
  STATUS_NEURO_ERR_INVALID = 4,
} StatusNeuroResult;

typedef enum {
  STATUS_NEURO_BACKEND_CPU = 0,
  STATUS_NEURO_BACKEND_ANE = 1,      /* Apple Neural Engine / Core ML */
  STATUS_NEURO_BACKEND_HEXAGON = 2,  /* Qualcomm Hexagon NPU */
  STATUS_NEURO_BACKEND_LOIHI = 3,    /* Intel Loihi-class neuromorphic */
  STATUS_NEURO_BACKEND_NNAPI = 4,    /* Android NNAPI */
} StatusNeuroBackend;

typedef struct {
  StatusNeuroBackend backend;
  int32_t npu_available;
  int32_t max_spikes_per_ms;
  double last_infer_ms;
  char device_name[64];
} StatusNeuroDeviceInfo;

typedef struct {
  const float* samples;   /* mono PCM float32 [-1,1] */
  size_t sample_count;
  int32_t sample_rate;
} StatusNeuroAudioFrame;

typedef struct {
  float gesture_x;
  float gesture_y;
  float gesture_z;
  float confidence;
  int32_t gesture_id; /* opaque class id */
} StatusNeuroGestureEvent;

typedef struct {
  int32_t intent_id;
  float confidence;
  double latency_ms;
  int32_t spike_count;
} StatusNeuroInferenceResult;

/** Initialize SNN runtime; prefers NPU when available. */
StatusNeuroResult status_neuro_init(StatusNeuroBackend preferred);

/** Release all neuromorphic resources. */
void status_neuro_shutdown(void);

/** Query active device / backend. */
StatusNeuroResult status_neuro_device_info(StatusNeuroDeviceInfo* out);

/**
 * Ambient voice spike encode + classify.
 * Designed for continuous streaming; keeps state in ring buffer.
 */
StatusNeuroResult status_neuro_infer_voice(
    const StatusNeuroAudioFrame* frame,
    StatusNeuroInferenceResult* out);

/** Gesture spike event classify (IMU / vision keypoints already featurized). */
StatusNeuroResult status_neuro_infer_gesture(
    const float* features,
    size_t feature_len,
    StatusNeuroGestureEvent* out);

/** Force backend switch (e.g. thermal throttle → CPU). */
StatusNeuroResult status_neuro_set_backend(StatusNeuroBackend backend);

#ifdef __cplusplus
} /* extern "C" */
#endif
