#pragma once
/**
 * Phase 43 — Runtime meta-compilation daemon ABI (self-actualizing architecture).
 * Analyzes bottlenecks, proposes rewrites, compiles in zero-trust sandbox.
 * Hot-swap is gated; never bypasses human alignment / kill-switch.
 */

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>

typedef enum {
  STATUS_META_OK = 0,
  STATUS_META_ERR_INIT = 1,
  STATUS_META_ERR_SANDBOX = 2,
  STATUS_META_ERR_DENIED = 3,
  STATUS_META_ERR_INVALID = 4,
} StatusMetaResult;

typedef struct {
  char hotspot_path[256];
  double cpu_pct;
  double p99_ms;
  int32_t rewrite_suggested;
} StatusMetaBottleneck;

typedef struct {
  char proposal_id[64];
  char target_path[256];
  int32_t sandboxed;
  int32_t alignment_ok;
  int32_t hot_swap_allowed;
} StatusMetaProposal;

StatusMetaResult status_meta_init(void);
void status_meta_shutdown(void);

StatusMetaResult status_meta_analyze(
    const char* metrics_json,
    StatusMetaBottleneck* out,
    size_t max_out,
    size_t* out_count);

StatusMetaResult status_meta_propose_rewrite(
    const StatusMetaBottleneck* bottleneck,
    StatusMetaProposal* out);

/** Compile proposal inside sandbox; never writes production paths unless allowed=1. */
StatusMetaResult status_meta_sandbox_compile(
    const StatusMetaProposal* proposal,
    const char* source_stub,
    int32_t allow_hot_swap,
    char* out_artifact_path,
    size_t path_cap);

#ifdef __cplusplus
}
#endif
