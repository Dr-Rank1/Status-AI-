/**
 * Phase 45 — Zero-point entropy driver stub (CPU CSPRNG stand-in for vacuum QRNG).
 */

#include "status_zpe.h"

#include <chrono>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <random>

namespace {
std::mutex g_mu;
bool g_ready = false;
StatusZpeBackend g_backend = STATUS_ZPE_BACKEND_SIM;
double g_last_pj = 0.001;
double g_sigma = 0.02;
char g_device[64] = "zpe-sim";
std::mt19937_64 g_rng{std::random_device{}()};
}

extern "C" {

StatusZpeResult status_zpe_init(StatusZpeBackend preferred) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_backend = preferred;
  if (preferred == STATUS_ZPE_BACKEND_QRNG) {
    std::snprintf(g_device, sizeof(g_device), "qrng-stub");
    g_sigma = 0.05;
  } else if (preferred == STATUS_ZPE_BACKEND_VACUUM_PROBE) {
    std::snprintf(g_device, sizeof(g_device), "vacuum-probe-stub");
    g_sigma = 0.08;
  } else {
    g_backend = STATUS_ZPE_BACKEND_SIM;
    std::snprintf(g_device, sizeof(g_device), "zpe-sim");
    g_sigma = 0.02;
  }
  g_ready = true;
  return STATUS_ZPE_OK;
}

void status_zpe_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusZpeResult status_zpe_device_info(StatusZpeDeviceInfo* out) {
  if (!out) return STATUS_ZPE_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_ZPE_ERR_INIT;
  out->backend = g_backend;
  out->last_harvest_pj = g_last_pj;
  out->fluctuation_sigma = g_sigma;
  std::snprintf(out->device_name, sizeof(out->device_name), "%s", g_device);
  return STATUS_ZPE_OK;
}

StatusZpeResult status_zpe_harvest_entropy(
    uint8_t* out,
    size_t out_len,
    double* energy_pj) {
  if (!out || out_len == 0) return STATUS_ZPE_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_ZPE_ERR_INIT;

  std::uniform_int_distribution<int> dist(0, 255);
  // Mix wall-clock jitter as non-thermal fluctuation proxy
  const auto ns = std::chrono::steady_clock::now().time_since_epoch().count();
  g_rng.seed(static_cast<uint64_t>(ns) ^ g_rng());
  for (size_t i = 0; i < out_len; ++i) {
    out[i] = static_cast<uint8_t>(dist(g_rng) ^ ((ns >> (i % 16)) & 0xff));
  }
  g_last_pj = 0.001 * static_cast<double>(out_len);
  if (energy_pj) *energy_pj = g_last_pj;
  return STATUS_ZPE_OK;
}

}  // extern "C"
