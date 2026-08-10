#pragma once
/**
 * Phase 45 — Zero-point energy / vacuum-fluctuation entropy bridge
 * (`zero_point_compute_bridge`).
 *
 * Abstracts non-thermal quantum fluctuation telemetry for true non-deterministic
 * entropy generation. Vendor ZPE / QRNG devices replace CPU sim at link time.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_ZPE_OK = 0,
  STATUS_ZPE_ERR_INIT = 1,
  STATUS_ZPE_ERR_UNSUPPORTED = 2,
  STATUS_ZPE_ERR_ENTROPY = 3,
  STATUS_ZPE_ERR_INVALID = 4,
} StatusZpeResult;

typedef enum {
  STATUS_ZPE_BACKEND_SIM = 0,
  STATUS_ZPE_BACKEND_QRNG = 1,
  STATUS_ZPE_BACKEND_VACUUM_PROBE = 2,
} StatusZpeBackend;

typedef struct {
  StatusZpeBackend backend;
  double last_harvest_pj;
  double fluctuation_sigma;
  char device_name[64];
} StatusZpeDeviceInfo;

StatusZpeResult status_zpe_init(StatusZpeBackend preferred);
void status_zpe_shutdown(void);
StatusZpeResult status_zpe_device_info(StatusZpeDeviceInfo* out);

/**
 * Harvest entropy bytes from zero-point / vacuum fluctuation abstraction.
 * out_len bytes written to out; energy_pj reports synthetic harvest cost.
 */
StatusZpeResult status_zpe_harvest_entropy(
    uint8_t* out,
    size_t out_len,
    double* energy_pj);

#ifdef __cplusplus
}
#endif
