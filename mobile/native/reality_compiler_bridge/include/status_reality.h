#pragma once
/**
 * Phase 48 — Code-to-matter / reality compiler bridge (`reality_compiler_bridge`).
 *
 * Translates programmatic structural definitions into localized "matter" recipes.
 * Open-source builds emit blueprints only — no physical fabrication.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_REALITY_OK = 0,
  STATUS_REALITY_ERR_INIT = 1,
  STATUS_REALITY_ERR_INVALID = 2,
  STATUS_REALITY_ERR_DENIED = 3,
} StatusRealityResult;

typedef struct {
  int32_t fabrication_enabled;
  double last_compile_ns;
  char device_name[64];
} StatusRealityDeviceInfo;

StatusRealityResult status_reality_init(int32_t allow_fabricate);
void status_reality_shutdown(void);
StatusRealityResult status_reality_device_info(StatusRealityDeviceInfo* out);

/**
 * Compile a structural JSON-like definition (UTF-8) into a matter recipe hash.
 * out_recipe_id must be >= 64 bytes.
 */
StatusRealityResult status_reality_compile(
    const char* definition_utf8,
    size_t len,
    char* out_recipe_id,
    size_t recipe_cap,
    double* energy_joules_est);

#ifdef __cplusplus
}
#endif
