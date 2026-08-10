import { exportAuditTrail } from '../services/aiGovernanceService.js';
import { getRecentAnomalies } from '../services/aiAnomalyDetectionService.js';
import { checkReadReplicas } from '../config/database.js';
import { isCdnEnabled } from '../config/cdn.js';

export async function exportComplianceAudit(req, res) {
  const since = req.query.since ?? null;
  const until = req.query.until ?? null;
  const limit = parseInt(req.query.limit ?? '500', 10);
  const format = req.query.format ?? 'json';

  const audit = await exportAuditTrail({ since, until, limit });

  if (format === 'ndjson') {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', 'attachment; filename="status-compliance-audit.ndjson"');
    for (const row of audit.governanceLogs) {
      res.write(`${JSON.stringify({ type: 'governance', ...row })}\n`);
    }
    for (const row of audit.consentHistory) {
      res.write(`${JSON.stringify({ type: 'consent', ...row })}\n`);
    }
    return res.end();
  }

  res.json({ data: audit });
}

export async function complianceStatus(req, res) {
  const anomalies = await getRecentAnomalies({ limit: 20 });
  const replicas = await checkReadReplicas();

  res.json({
    data: {
      cdnEnabled: isCdnEnabled(),
      readReplicas: replicas,
      recentAnomalies: anomalies,
      pqAuthEnabled: process.env.PQ_AUTH_ENABLED !== 'false',
      governancePolicyVersion: process.env.CONSENT_POLICY_VERSION ?? '2026-01',
    },
  });
}
