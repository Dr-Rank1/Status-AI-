/**
 * Phase 43 — Meta-compiler daemon stub (C++).
 * Real builds link Rust crate `status_meta_compiler` for analysis kernels.
 */

#include "status_meta_compiler.h"

#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>

namespace {
std::mutex g_mu;
bool g_ready = false;
}

extern "C" {

StatusMetaResult status_meta_init(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = true;
  return STATUS_META_OK;
}

void status_meta_shutdown(void) {
  std::lock_guard<std::mutex> lock(g_mu);
  g_ready = false;
}

StatusMetaResult status_meta_analyze(
    const char* metrics_json,
    StatusMetaBottleneck* out,
    size_t max_out,
    size_t* out_count) {
  if (!out || !out_count || max_out == 0) return STATUS_META_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_META_ERR_INIT;

  // Minimal heuristic: if JSON mentions p99 or cpu, emit one hotspot stub.
  const char* src = metrics_json ? metrics_json : "";
  std::snprintf(out[0].hotspot_path, sizeof(out[0].hotspot_path), "%s",
                std::strstr(src, "ContextEngine") ? "backend/src/services/context/ContextEngine.js"
                                                  : "backend/src/services/ai/agentTools.js");
  out[0].cpu_pct = std::strstr(src, "cpu") ? 82.0 : 45.0;
  out[0].p99_ms = std::strstr(src, "p99") ? 120.0 : 40.0;
  out[0].rewrite_suggested = out[0].cpu_pct > 70.0 || out[0].p99_ms > 80.0 ? 1 : 0;
  *out_count = 1;
  return STATUS_META_OK;
}

StatusMetaResult status_meta_propose_rewrite(
    const StatusMetaBottleneck* bottleneck,
    StatusMetaProposal* out) {
  if (!bottleneck || !out) return STATUS_META_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_META_ERR_INIT;
  std::snprintf(out->proposal_id, sizeof(out->proposal_id), "meta-%u", 42u);
  std::snprintf(out->target_path, sizeof(out->target_path), "%s", bottleneck->hotspot_path);
  out->sandboxed = 1;
  out->alignment_ok = 1;
  out->hot_swap_allowed = 0; // human / env gate required
  return STATUS_META_OK;
}

StatusMetaResult status_meta_sandbox_compile(
    const StatusMetaProposal* proposal,
    const char* source_stub,
    int32_t allow_hot_swap,
    char* out_artifact_path,
    size_t path_cap) {
  if (!proposal || !out_artifact_path || path_cap < 8) return STATUS_META_ERR_INVALID;
  std::lock_guard<std::mutex> lock(g_mu);
  if (!g_ready) return STATUS_META_ERR_INIT;
  if (!proposal->sandboxed || !proposal->alignment_ok) return STATUS_META_ERR_DENIED;
  if (allow_hot_swap && !proposal->hot_swap_allowed) return STATUS_META_ERR_DENIED;
  (void)source_stub;
  std::snprintf(out_artifact_path, path_cap, "data/meta-compiler/%s.artifact", proposal->proposal_id);
  return STATUS_META_OK;
}

}  // extern "C"
