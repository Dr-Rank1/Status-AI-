#pragma once
/**
 * Phase 42 — Photonic / optical AI compute bridge (photonic_compute_bridge)
 *
 * Silicon-photonics OPU stubs for sub-nanosecond optical matmul,
 * spatial vector search, and multi-agent intent decode.
 * Link vendor OPU SDKs at build time; CPU optical-sim fallback otherwise.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_PHOTONIC_OK = 0,
  STATUS_PHOTONIC_ERR_INIT = 1,
  STATUS_PHOTONIC_ERR_UNSUPPORTED = 2,
  STATUS_PHOTONIC_ERR_DIM = 3,
  STATUS_PHOTONIC_ERR_INVALID = 4,
} StatusPhotonicResult;

typedef enum {
  STATUS_PHOTONIC_BACKEND_CPU_SIM = 0,
  STATUS_PHOTONIC_BACKEND_OPU = 1,          /* Optical Processing Unit */
  STATUS_PHOTONIC_BACKEND_SILICON_PHOTONICS = 2,
  STATUS_PHOTONIC_BACKEND_MZI_MESH = 3,     /* Mach–Zehnder interferometer mesh */
} StatusPhotonicBackend;

typedef struct {
  StatusPhotonicBackend backend;
  int32_t opu_available;
  double last_matmul_ns;
  double thermal_mw; /* near-zero on optical path */
  char device_name[64];
} StatusPhotonicDeviceInfo;

typedef struct {
  int32_t intent_id;
  float confidence;
  double latency_ns;
  int32_t agent_hint;
} StatusPhotonicIntentResult;

/** Initialize photonic runtime (prefers OPU when present). */
StatusPhotonicResult status_photonic_init(StatusPhotonicBackend preferred);

void status_photonic_shutdown(void);

StatusPhotonicResult status_photonic_device_info(StatusPhotonicDeviceInfo* out);

/**
 * Optical matrix multiply: C = A (m×k) · B (k×n), row-major float32.
 * Target: sub-nanosecond optical path; CPU sim reports synthetic ns.
 */
StatusPhotonicResult status_photonic_matmul(
    const float* a,
    const float* b,
    float* c,
    size_t m,
    size_t k,
    size_t n,
    double* out_latency_ns);

/**
 * Spatial vector search: top-1 cosine over corpus rows (dim = d).
 * query length d; corpus length n_vectors * d.
 */
StatusPhotonicResult status_photonic_vector_search(
    const float* query,
    const float* corpus,
    size_t n_vectors,
    size_t dim,
    int32_t* out_index,
    float* out_score,
    double* out_latency_ns);

/** Multi-agent intent decode from optical feature vector. */
StatusPhotonicResult status_photonic_decode_intent(
    const float* features,
    size_t feature_count,
    StatusPhotonicIntentResult* out);

#ifdef __cplusplus
}
#endif
