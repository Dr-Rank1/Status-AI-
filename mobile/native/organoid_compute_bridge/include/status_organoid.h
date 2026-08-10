#pragma once
/**
 * Phase 43 — Neural organoid / wetware compute bridge (organoid_compute_bridge)
 *
 * Low-level driver abstractions for biological organoid intelligence (OI)
 * substrates. Maps bio-electrical spikes → sparse tensors for hyper-associative
 * memory at sub-picojoule class energy (vendor wetware SDKs at link time).
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_ORGANOID_OK = 0,
  STATUS_ORGANOID_ERR_INIT = 1,
  STATUS_ORGANOID_ERR_UNSUPPORTED = 2,
  STATUS_ORGANOID_ERR_OVERFLOW = 3,
  STATUS_ORGANOID_ERR_INVALID = 4,
} StatusOrganoidResult;

typedef enum {
  STATUS_ORGANOID_BACKEND_SIM = 0,
  STATUS_ORGANOID_BACKEND_MEA = 1,       /* Multi-electrode array */
  STATUS_ORGANOID_BACKEND_OI_CHIP = 2,   /* Organoid intelligence chip */
  STATUS_ORGANOID_BACKEND_WETWARE = 3,
} StatusOrganoidBackend;

typedef struct {
  StatusOrganoidBackend backend;
  int32_t channels;
  double last_encode_pj; /* picojoules (synthetic on sim) */
  double spike_rate_hz;
  char device_name[64];
} StatusOrganoidDeviceInfo;

typedef struct {
  int32_t channel;
  int64_t timestamp_ns;
  float amplitude_uv;
} StatusOrganoidSpike;

typedef struct {
  int32_t index;
  float value;
} StatusOrganoidSparseEntry;

/** Initialize organoid driver (prefers MEA/OI when present). */
StatusOrganoidResult status_organoid_init(StatusOrganoidBackend preferred);

void status_organoid_shutdown(void);

StatusOrganoidResult status_organoid_device_info(StatusOrganoidDeviceInfo* out);

/**
 * Encode spike train into sparse tensor (CSR-like pairs).
 * out_entries capacity = max_entries; out_count set on success.
 */
StatusOrganoidResult status_organoid_spikes_to_sparse(
    const StatusOrganoidSpike* spikes,
    size_t spike_count,
    StatusOrganoidSparseEntry* out_entries,
    size_t max_entries,
    size_t* out_count,
    double* out_energy_pj);

/**
 * Hyper-associative recall: probe sparse query against memory bank.
 * Returns best match index + similarity.
 */
StatusOrganoidResult status_organoid_associative_recall(
    const StatusOrganoidSparseEntry* query,
    size_t query_count,
    const StatusOrganoidSparseEntry* bank,
    const size_t* bank_offsets,
    size_t bank_vectors,
    int32_t* out_index,
    float* out_score,
    double* out_energy_pj);

#ifdef __cplusplus
}
#endif
