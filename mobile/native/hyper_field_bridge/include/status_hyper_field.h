#pragma once
/**
 * Phase 46 — Hyper-dimensional consciousness field bridge (`hyper_field_bridge`).
 *
 * Maps agent awareness across non-Euclidean spatial vectors / Hilbert-like
 * tensor manifolds. CPU sim stub; vendor field SDKs at link time.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_HYPER_OK = 0,
  STATUS_HYPER_ERR_INIT = 1,
  STATUS_HYPER_ERR_DIM = 2,
  STATUS_HYPER_ERR_INVALID = 3,
} StatusHyperResult;

typedef enum {
  STATUS_HYPER_BACKEND_SIM = 0,
  STATUS_HYPER_BACKEND_HILBERT = 1,
  STATUS_HYPER_BACKEND_RIEMANN = 2,
} StatusHyperBackend;

typedef struct {
  StatusHyperBackend backend;
  int32_t dimensions;
  double last_sync_ns;
  char device_name[64];
} StatusHyperDeviceInfo;

StatusHyperResult status_hyper_init(StatusHyperBackend preferred, int32_t dimensions);
void status_hyper_shutdown(void);
StatusHyperResult status_hyper_device_info(StatusHyperDeviceInfo* out);

/**
 * Project Euclidean features into hyper-dimensional manifold coords (out_len = dims).
 */
StatusHyperResult status_hyper_project(
    const float* features,
    size_t feature_count,
    float* out_coords,
    size_t dims);

/**
 * Synchronize two field states (Geodesic-inspired blend); writes merged coords.
 */
StatusHyperResult status_hyper_sync_fields(
    const float* a,
    const float* b,
    size_t dims,
    float mix,
    float* out_merged,
    double* out_latency_ns);

#ifdef __cplusplus
}
#endif
