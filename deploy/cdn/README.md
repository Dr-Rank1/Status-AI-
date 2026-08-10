# Global Edge CDN

Terraform configs for **AWS CloudFront** and optional **Cloudflare** edge caching.

## Assets cached at edge

| Path | Content |
|------|---------|
| `/media/*` | Uploaded images, post media |
| `/avatars-3d/*` | Character `.glb` 3D models |

## Backend configuration

Set in `backend/.env`:

```env
CDN_BASE_URL=https://cdn.status.app
CDN_UPLOADS_PREFIX=/media
CDN_MODELS_PREFIX=/avatars-3d
```

The API rewrites feed media URLs via `backend/src/config/cdn.js`.

## Deploy CloudFront

```bash
cd deploy/cdn
terraform init
terraform apply -var="domain=cdn.status.app" -var="origin_bucket=status-prod-media"
```

## Cloudflare overlay

```bash
export CLOUDFLARE_API_TOKEN=...
terraform apply -target=cloudflare_record.cdn -var="zone_id=..." -var="cdn_cname_target=d123.cloudfront.net"
```

## Read replica routing

Configure geographic PostgreSQL replicas:

```env
DATABASE_READ_URLS=eu-west-1=postgresql://...,ap-southeast-1=postgresql://...
DEFAULT_READ_REGION=us-east-1
```

Feed reads auto-route via `CF-IPCountry` / `CloudFront-Viewer-Country` headers.
