/**
 * Phase 46 — Hyper-dimensional field sync stub.
 */

#include "status_hyper_field.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <vector>

namespace {
std::mutex g_mu;
bool g_ready = false;
StatusHyperBackend g_backend = STATUS_HYPER_BACKEND_SIM;
int32_t g_dims = 16;
double g_last_ns = 0.0;
char g_device[64] = "hyper-field-sim";

double now_ns() {
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double, std::nano>(clock::now().time_since_epoch()).count();
}
}

extern "C" {

StatusHyperResult status_hyper_init(StatusHyperBackend preferred, int32_t dimensions) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_backend = preferred;
  g_dims = dimensions > 0 ? dimensions : 16;
  if (preferred == STATUS_HYPER_BACKEND_HILBERT) {
    std::snprintf(g_device, sizeof(g_device), "hilbert-stub");
  } else if (preferred == STATUS_HYPER_BACKEND_RIEMANN) {
    std::snprintf(g_device, sizeof(g_device), "riemann-stub");
  } else {
    g_backend = STATUS_HYPER_BACKEND_SIM;
    std::snprintf(g_device, sizeof(g_device), "hyper-field-sim");
  }
  g_ready = true;
  return STATUS_HYPER_OK;
}

void status_hyper_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusHyperResult status_hyper_device_info(StatusHyperDeviceInfo* out) {
  if (!out) return STATUS_HYPER_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_HYPER_ERR_INIT;
  out->backend = g_backend;
  out->dimensions = g_dims;
  out->last_sync_ns = g_last_ns;
  std::snprintf(out->device_name, sizeof(out->device_name), "%s", g_device);
  return STATUS_HYPER_OK;
}

StatusHyperResult status_hyper_project(
    const float* features,
    size_t feature_count,
    float* out_coords,
    size_t dims) {
  if (!features || !out_coords || dims == 0) return STATUS_HYPER_ERR_DIM;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_HYPER_ERR_INIT;

  for (size_t i = 0; i < dims; ++i) {
    float acc = 0.0f;
    for (size_t j = 0; j < feature_count; ++j) {
      // Non-Euclidean-ish warp: sinusoidal basis embedding
      acc += features[j] * static_cast<float>(std::sin(0.37 * (i + 1) * (j + 1)));
    }
    out_coords[i] = std::tanh(acc / std::max<size_t>(feature_count, 1));
  }
  return STATUS_HYPER_OK;
}

StatusHyperResult status_hyper_sync_fields(
    const float* a,
    const float* b,
    size_t dims,
    float mix,
    float* out_merged,
    double* out_latency_ns) {
  if (!a || !b || !out_merged || dims == 0) return STATUS_HYPER_ERR_DIM;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_HYPER_ERR_INIT;
  const double t0 = now_ns();
  const float m = std::clamp(mix, 0.0f, 1.0f);
  for (size_t i = 0; i < dims; ++i) {
    // Spherical linear-ish blend on unit-ish coords
    out_merged[i] = a[i] * (1.0f - m) + b[i] * m;
  }
  g_last_ns = now_ns() - t0;
  if (out_latency_ns) *out_latency_ns = g_last_ns;
  return STATUS_HYPER_OK;
}

}  // extern "C"
