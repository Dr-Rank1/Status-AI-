/**
 * Phase 47 — Planck-scale state driver stub (compact ring = "defect mesh").
 */

#include "status_planck.h"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <vector>

namespace {

std::mutex g_mu;
bool g_ready = false;
int32_t g_slots = 256;
int32_t g_used = 0;
int32_t g_cursor = 0;
double g_last_ns = 0;
char g_device[64] = "planck-sim";
std::vector<std::vector<uint8_t>> g_mesh;

double now_ns() {
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double, std::nano>(clock::now().time_since_epoch()).count();
}

}  // namespace

extern "C" {

StatusPlanckResult status_planck_init(int32_t slots) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_slots = slots > 0 ? slots : 256;
  g_mesh.assign(static_cast<size_t>(g_slots), {});
  g_used = 0;
  g_cursor = 0;
  std::snprintf(g_device, sizeof(g_device), "planck-defect-mesh");
  g_ready = true;
  return STATUS_PLANCK_OK;
}

void status_planck_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_mesh.clear();
  g_ready = false;
}

StatusPlanckResult status_planck_device_info(StatusPlanckDeviceInfo* out) {
  if (!out) return STATUS_PLANCK_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_PLANCK_ERR_INIT;
  out->slots = g_slots;
  out->used = g_used;
  out->last_encode_ns = g_last_ns;
  std::snprintf(out->device_name, sizeof(out->device_name), "%s", g_device);
  return STATUS_PLANCK_OK;
}

StatusPlanckResult status_planck_encode(
    const uint8_t* data,
    size_t len,
    int32_t* out_slot,
    double* out_latency_ns) {
  if (!data || !out_slot || len == 0) return STATUS_PLANCK_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_PLANCK_ERR_INIT;
  const double t0 = now_ns();
  const int32_t slot = g_cursor % g_slots;
  g_mesh[static_cast<size_t>(slot)].assign(data, data + len);
  g_cursor += 1;
  if (g_used < g_slots) g_used += 1;
  *out_slot = slot;
  g_last_ns = now_ns() - t0;
  // Report optical/c-bound synthetic latency floor
  if (out_latency_ns) *out_latency_ns = std::max(0.01, g_last_ns * 1e-3);
  return STATUS_PLANCK_OK;
}

StatusPlanckResult status_planck_decode(
    int32_t slot,
    uint8_t* out,
    size_t max_len,
    size_t* out_len) {
  if (!out || !out_len || slot < 0 || slot >= g_slots) return STATUS_PLANCK_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_PLANCK_ERR_INIT;
  const auto& cell = g_mesh[static_cast<size_t>(slot)];
  if (cell.empty()) {
    *out_len = 0;
    return STATUS_PLANCK_OK;
  }
  const size_t n = std::min(max_len, cell.size());
  std::memcpy(out, cell.data(), n);
  *out_len = n;
  return STATUS_PLANCK_OK;
}

}  // extern "C"
