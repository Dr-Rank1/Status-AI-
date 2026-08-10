/**
 * Phase 43 — Organoid wetware driver stub (CPU bio-sim).
 * Replace with MEA / OI vendor SDKs at link time.
 */

#include "status_organoid.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace {

std::mutex g_mu;
bool g_ready = false;
StatusOrganoidBackend g_backend = STATUS_ORGANOID_BACKEND_SIM;
double g_last_pj = 0.05;
double g_spike_hz = 0.0;
char g_device[64] = "organoid-sim";

}  // namespace

extern "C" {

StatusOrganoidResult status_organoid_init(StatusOrganoidBackend preferred) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_backend = preferred;
  if (preferred == STATUS_ORGANOID_BACKEND_MEA) {
    std::snprintf(g_device, sizeof(g_device), "mea-stub");
    g_last_pj = 0.02;
  } else if (preferred == STATUS_ORGANOID_BACKEND_OI_CHIP) {
    std::snprintf(g_device, sizeof(g_device), "oi-chip-stub");
    g_last_pj = 0.01;
  } else if (preferred == STATUS_ORGANOID_BACKEND_WETWARE) {
    std::snprintf(g_device, sizeof(g_device), "wetware-stub");
    g_last_pj = 0.008;
  } else {
    g_backend = STATUS_ORGANOID_BACKEND_SIM;
    std::snprintf(g_device, sizeof(g_device), "organoid-sim");
    g_last_pj = 0.05;
  }
  g_ready = true;
  return STATUS_ORGANOID_OK;
}

void status_organoid_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusOrganoidResult status_organoid_device_info(StatusOrganoidDeviceInfo* out) {
  if (!out) return STATUS_ORGANOID_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_ORGANOID_ERR_INIT;
  out->backend = g_backend;
  out->channels = 64;
  out->last_encode_pj = g_last_pj;
  out->spike_rate_hz = g_spike_hz;
  std::snprintf(out->device_name, sizeof(out->device_name), "%s", g_device);
  return STATUS_ORGANOID_OK;
}

StatusOrganoidResult status_organoid_spikes_to_sparse(
    const StatusOrganoidSpike* spikes,
    size_t spike_count,
    StatusOrganoidSparseEntry* out_entries,
    size_t max_entries,
    size_t* out_count,
    double* out_energy_pj) {
  if (!spikes || !out_entries || !out_count || max_entries == 0) {
    return STATUS_ORGANOID_ERR_INVALID;
  }
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_ORGANOID_ERR_INIT;

  std::unordered_map<int32_t, float> acc;
  for (size_t i = 0; i < spike_count; ++i) {
    const auto& s = spikes[i];
    acc[s.channel] += std::fabs(s.amplitude_uv);
  }

  size_t n = 0;
  for (const auto& kv : acc) {
    if (n >= max_entries) return STATUS_ORGANOID_ERR_OVERFLOW;
    out_entries[n].index = kv.first;
    out_entries[n].value = kv.second;
    ++n;
  }
  *out_count = n;

  const double energy = (g_backend == STATUS_ORGANOID_BACKEND_SIM ? 0.05 : 0.01)
      * static_cast<double>(spike_count + 1);
  g_last_pj = energy;
  g_spike_hz = static_cast<double>(spike_count);
  if (out_energy_pj) *out_energy_pj = energy;
  return STATUS_ORGANOID_OK;
}

StatusOrganoidResult status_organoid_associative_recall(
    const StatusOrganoidSparseEntry* query,
    size_t query_count,
    const StatusOrganoidSparseEntry* bank,
    const size_t* bank_offsets,
    size_t bank_vectors,
    int32_t* out_index,
    float* out_score,
    double* out_energy_pj) {
  if (!query || !bank || !bank_offsets || !out_index || !out_score || bank_vectors == 0) {
    return STATUS_ORGANOID_ERR_INVALID;
  }
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_ORGANOID_ERR_INIT;

  int32_t best = 0;
  float best_score = -1.0f;
  for (size_t v = 0; v < bank_vectors; ++v) {
    const size_t start = bank_offsets[v];
    const size_t end = bank_offsets[v + 1];
    float score = 0.0f;
    for (size_t qi = 0; qi < query_count; ++qi) {
      for (size_t bi = start; bi < end; ++bi) {
        if (bank[bi].index == query[qi].index) {
          score += bank[bi].value * query[qi].value;
        }
      }
    }
    if (score > best_score) {
      best_score = score;
      best = static_cast<int32_t>(v);
    }
  }
  *out_index = best;
  *out_score = best_score;
  const double energy = g_backend == STATUS_ORGANOID_BACKEND_SIM ? 0.08 : 0.015;
  g_last_pj = energy;
  if (out_energy_pj) *out_energy_pj = energy;
  return STATUS_ORGANOID_OK;
}

}  // extern "C"
