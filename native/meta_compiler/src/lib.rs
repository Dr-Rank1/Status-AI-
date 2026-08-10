//! Phase 43 — Self-actualizing meta-compiler daemon (Rust).
//! Continuously scores bottlenecks, drafts sandboxed rewrites, never hot-swaps
//! without explicit allow + alignment gate.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bottleneck {
    pub hotspot_path: String,
    pub cpu_pct: f64,
    pub p99_ms: f64,
    pub rewrite_suggested: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proposal {
    pub proposal_id: String,
    pub target_path: String,
    pub sandboxed: bool,
    pub alignment_ok: bool,
    pub hot_swap_allowed: bool,
    pub source_stub: String,
    pub commitment: String,
}

#[derive(Debug, Deserialize)]
pub struct Metrics {
    pub path: Option<String>,
    pub cpu_pct: Option<f64>,
    pub p99_ms: Option<f64>,
}

/// Forbidden rewrite targets (zero-trust).
const DENY_PREFIXES: &[&str] = &[
    ".env",
    "backend/src/middleware/auth",
    "backend/src/services/security/globalKillSwitch",
    "backend/src/services/governance",
];

pub fn analyze_metrics(metrics: &Metrics) -> Bottleneck {
    let path = metrics
        .path
        .clone()
        .unwrap_or_else(|| "backend/src/services/ai/agentTools.js".into());
    let cpu = metrics.cpu_pct.unwrap_or(50.0);
    let p99 = metrics.p99_ms.unwrap_or(40.0);
    Bottleneck {
        hotspot_path: path,
        cpu_pct: cpu,
        p99_ms: p99,
        rewrite_suggested: cpu > 70.0 || p99 > 80.0,
    }
}

pub fn propose_rewrite(b: &Bottleneck) -> Result<Proposal, String> {
    for deny in DENY_PREFIXES {
        if b.hotspot_path.contains(deny) {
            return Err(format!("alignment deny: path matches {deny}"));
        }
    }
    let stub = format!(
        "// meta-compiler sandbox stub for {}\nexport function hotPath() {{ return true; }}\n",
        b.hotspot_path
    );
    let mut hasher = Sha256::new();
    hasher.update(stub.as_bytes());
    let commitment = hex::encode(hasher.finalize());
    Ok(Proposal {
        proposal_id: format!("meta-{}", &commitment[..12]),
        target_path: b.hotspot_path.clone(),
        sandboxed: true,
        alignment_ok: true,
        hot_swap_allowed: false,
        source_stub: stub,
        commitment,
    })
}

pub fn sandbox_compile(proposal: &Proposal, allow_hot_swap: bool) -> Result<String, String> {
    if !proposal.sandboxed || !proposal.alignment_ok {
        return Err("sandbox/alignment gate failed".into());
    }
    if allow_hot_swap && !proposal.hot_swap_allowed {
        return Err("hot-swap not permitted".into());
    }
    Ok(format!("data/meta-compiler/{}.artifact", proposal.proposal_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suggests_rewrite_on_high_p99() {
        let b = analyze_metrics(&Metrics {
            path: Some("backend/src/services/context/ContextEngine.js".into()),
            cpu_pct: Some(40.0),
            p99_ms: Some(150.0),
        });
        assert!(b.rewrite_suggested);
        let p = propose_rewrite(&b).unwrap();
        assert!(p.sandboxed);
        assert!(sandbox_compile(&p, true).is_err());
        assert!(sandbox_compile(&p, false).is_ok());
    }
}
