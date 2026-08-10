## Key rotation audit — 20260810T142414Z

| Key | Action | Applied |
|-----|--------|---------|
| `JWT_SECRET` | generated | pending |
| `DATABASE_URL` | placeholder / DB password | pending |

- Output file: `/tmp/status-env-test.env.rotated.20260810T142414Z`
- Backup: `/tmp/status-env-test.env.bak.20260810T142414Z` (created on --apply)
- Operator must restart API after apply: `systemctl restart status-api` or redeploy.
- Invalidate sessions: all JWTs signed with old `JWT_SECRET` become invalid.

