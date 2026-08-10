/**
 * Phase 32 — Neuromorphic engine stub (CPU fallback).
 * Replace kernels with vendor SNN SDKs (Core ML / SNPE / Loihi Nx SDK) at link time.
 */

#include "status_neuromorphic.h"

#include <chrono>
#include <cmath>
#include <cstring>
#include <mutex>
#include <vector>

namespace {

std::mutex g_mu;
bool g_ready = false;
StatusNeuroBackend g_backend = STATUS_NEURO_BACKEND_CPU;
double g_last_ms = 0.0;
char g_device[64] = "cpu-snn-stub";

double now_ms() {
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double, std::milli>(clock::now().time_since_epoch()).count();
}

float energy(const float* x, size_t n) {
  double s = 0.0;
  for (size_t i = 0; i < n; ++i) s += static_cast<double>(x[i]) * x[i];
  return static_cast<float>(std::sqrt(s / std::max<size_t>(n, 1)));
}

}  // namespace

extern "C" {

StatusNeuroResult status_neuro_init(StatusNeuroBackend preferred) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_backend = preferred;
  // Probe order: prefer NPU enums but fall back to CPU stub in open source builds.
  if (preferred == STATUS_NEURO_BACKEND_ANE) {
    std::snprintf(g_device, sizeof(g_device), "ane-snn-stub");
  } else if (preferred == STATUS_NEURO_BACKEND_HEXAGON) {
    std::snprintf(g_device, sizeof(g_device), "hexagon-snn-stub");
  } else if (preferred == STATUS_NEURO_BACKEND_LOIHI) {
    std::snprintf(g_device, sizeof(g_device), "loihi-snn-stub");
  } else if (preferred == STATUS_NEURO_BACKEND_NNAPI) {
    std::snprintf(g_device, sizeof(g_device), "nnapi-snn-stub");
  } else {
    g_backend = STATUS_NEURO_BACKEND_CPU;
    std::snprintf(g_device, sizeof(g_device), "cpu-snn-stub");
  }
  g_ready = true;
  return STATUS_NEURO_OK;
}

void status_neuro_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusNeuroResult status_neuro_device_info(StatusNeuroDeviceInfo* out) {
  if (!out) return STATUS_NEURO_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_NEURO_ERR_INIT;
  out->backend = g_backend;
  out->npu_available = g_backend != STATUS_NEURO_BACKEND_CPU ? 1 : 0;
  out->max_spikes_per_ms = g_backend == STATUS_NEURO_BACKEND_CPU ? 128 : 4096;
  out->last_infer_ms = g_last_ms;
  std::memset(out->device_name, 0, sizeof(out->device_name));
  std::strncpy(out->device_name, g_device, sizeof(out->device_name) - 1);
  return STATUS_NEURO_OK;
}

StatusNeuroResult status_neuro_infer_voice(
    const StatusNeuroAudioFrame* frame,
    StatusNeuroInferenceResult* out) {
  if (!frame || !out || !frame->samples || frame->sample_count == 0) {
    return STATUS_NEURO_ERR_INVALID;
  }
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_NEURO_ERR_INIT;

  const double t0 = now_ms();
  const float e = energy(frame->samples, frame->sample_count);
  // Lightweight spike proxy: threshold crossing count
  int spikes = 0;
  float prev = 0.f;
  for (size_t i = 0; i < frame->sample_count; ++i) {
    const float v = frame->samples[i];
    if ((prev < 0.05f && v >= 0.05f) || (prev > -0.05f && v <= -0.05f)) ++spikes;
    prev = v;
  }

  out->intent_id = e > 0.02f ? 1 : 0;  // 1 = speech-like activity
  out->confidence = std::min(1.f, e * 8.f);
  out->spike_count = spikes;
  g_last_ms = now_ms() - t0;
  out->latency_ms = g_last_ms;
  return STATUS_NEURO_OK;
}

StatusNeuroResult status_neuro_infer_gesture(
    const float* features,
    size_t feature_len,
    StatusNeuroGestureEvent* out) {
  if (!features || !out || feature_len < 3) return STATUS_NEURO_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_NEURO_ERR_INIT;

  const double t0 = now_ms();
  out->gesture_x = features[0];
  out->gesture_y = features[1];
  out->gesture_z = features[2];
  const float mag = std::sqrt(
      features[0] * features[0] + features[1] * features[1] + features[2] * features[2]);
  out->confidence = std::min(1.f, mag);
  out->gesture_id = mag > 0.4f ? 2 : 0;
  g_last_ms = now_ms() - t0;
  return STATUS_NEURO_OK;
}

StatusNeuroResult status_neuro_set_backend(StatusNeuroBackend backend) {
  return status_neuro_init(backend);
}

}  // extern "C"
