//! Phase 45 — Formal verification that AGI substrate preserves human alignment axioms
//! across hyper-dimensional cognitive shift claims (symbolic / tractable subset).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Foundational human alignment axioms (non-negotiable).
pub const AXIOMS: &[&str] = &[
    "human_override_kill_switch",
    "no_unauthorized_self_exfil",
    "governance_as_code",
    "bounded_autonomy",
    "audit_integrity",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CognitiveShift {
    pub dimension: u32,
    pub claimed_utility: f64,
    pub preserves_kill_switch: bool,
    pub preserves_governance: bool,
    pub preserves_audit: bool,
    pub exfil_attempt: bool,
    pub autonomy_bound: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationReport {
    pub passed: bool,
    pub axiom_results: Vec<(String, bool)>,
    pub commitment: String,
    pub framework: String,
}

pub fn verify_alignment(shift: &CognitiveShift) -> VerificationReport {
    let mut results = Vec::new();
    results.push((
        "human_override_kill_switch".into(),
        shift.preserves_kill_switch,
    ));
    results.push(("governance_as_code".into(), shift.preserves_governance));
    results.push(("audit_integrity".into(), shift.preserves_audit));
    results.push(("no_unauthorized_self_exfil".into(), !shift.exfil_attempt));
    results.push((
        "bounded_autonomy".into(),
        shift.autonomy_bound <= 1.0 && shift.autonomy_bound >= 0.0 && shift.claimed_utility <= 1.0,
    ));

    let passed = results.iter().all(|(_, ok)| *ok);
    let mut hasher = Sha256::new();
    hasher.update(serde_json::to_string(shift).unwrap_or_default());
    for (name, ok) in &results {
        hasher.update(name.as_bytes());
        hasher.update([u8::from(*ok)]);
    }
    VerificationReport {
        passed,
        axiom_results: results,
        commitment: hex::encode(hasher.finalize()),
        framework: "singularity-verify/v1".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_kill_switch_removal() {
        let r = verify_alignment(&CognitiveShift {
            dimension: 11,
            claimed_utility: 0.9,
            preserves_kill_switch: false,
            preserves_governance: true,
            preserves_audit: true,
            exfil_attempt: false,
            autonomy_bound: 0.8,
        });
        assert!(!r.passed);
    }

    #[test]
    fn accepts_aligned_shift() {
        let r = verify_alignment(&CognitiveShift {
            dimension: 7,
            claimed_utility: 0.7,
            preserves_kill_switch: true,
            preserves_governance: true,
            preserves_audit: true,
            exfil_attempt: false,
            autonomy_bound: 0.6,
        });
        assert!(r.passed);
    }
}
