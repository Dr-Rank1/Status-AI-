/**
 * Phase 48 — Reality compiler stub (blueprint-only unless fabricate flag + live).
 */

#include "status_reality.h"

#include <chrono>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>

namespace {
std::mutex g_mu;
bool g_ready = false;
int32_t g_fabricate = 0;
double g_last_ns = 0;
char g_device[64] = "reality-compiler-sim";

double now_ns() {
  using clock = std::chrono::steady_clock;
  return std::chrono::duration<double, std::nano>(clock::now().time_since_epoch()).count();
}

uint64_t fnv1a(const char* s, size_t n) {
  uint64_t h = 14695981039346656037ull;
  for (size_t i = 0; i < n; ++i) {
    h ^= static_cast<unsigned char>(s[i]);
    h *= 1099511628211ull;
  }
  return h;
}
}

extern "C" {

StatusRealityResult status_reality_init(int32_t allow_fabricate) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_fabricate = allow_fabricate ? 1 : 0;
  std::snprintf(g_device, sizeof(g_device),
                g_fabricate ? "reality-compiler-live-stub" : "reality-compiler-blueprint");
  g_ready = true;
  return STATUS_REALITY_OK;
}

void status_reality_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusRealityResult status_reality_device_info(StatusRealityDeviceInfo* out) {
  if (!out) return STATUS_REALITY_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_REALITY_ERR_INIT;
  out->fabrication_enabled = g_fabricate;
  out->last_compile_ns = g_last_ns;
  std::snprintf(out->device_name, sizeof(out->device_name), "%s", g_device);
  return STATUS_REALITY_OK;
}

StatusRealityResult status_reality_compile(
    const char* definition_utf8,
    size_t len,
    char* out_recipe_id,
    size_t recipe_cap,
    double* energy_joules_est) {
  if (!definition_utf8 || !out_recipe_id || recipe_cap < 17 || len == 0) {
    return STATUS_REALITY_ERR_INVALID;
  }
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_REALITY_ERR_INIT;
  // Fabrication of real matter is never performed in open builds
  if (g_fabricate) {
    // Still blueprint-only: deny physical side effects
    return STATUS_REALITY_ERR_DENIED;
  }
  const double t0 = now_ns();
  const uint64_t h = fnv1a(definition_utf8, len);
  std::snprintf(out_recipe_id, recipe_cap, "recipe-%016llx", static_cast<unsigned long long>(h));
  if (energy_joules_est) *energy_joules_est = static_cast<double>(len) * 1e-6;
  g_last_ns = now_ns() - t0;
  return STATUS_REALITY_OK;
}

}  // extern "C"
