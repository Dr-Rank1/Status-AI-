# Optional Cloudflare edge configuration (DNS + cache rules)
# Requires CLOUDFLARE_API_TOKEN environment variable.

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "zone_id" {
  description = "Cloudflare zone ID for status.app"
  type        = string
}

variable "cdn_hostname" {
  default = "cdn.status.app"
}

variable "api_hostname" {
  default = "api.status.app"
}

provider "cloudflare" {}

resource "cloudflare_record" "cdn" {
  zone_id = var.zone_id
  name    = "cdn"
  value   = var.cdn_cname_target
  type    = "CNAME"
  proxied = true
}

variable "cdn_cname_target" {
  description = "CloudFront distribution domain"
  type        = string
}

resource "cloudflare_page_rule" "cache_glb" {
  zone_id  = var.zone_id
  target   = "${var.cdn_hostname}/avatars-3d/*"
  priority = 1

  actions {
    cache_level       = "cache_everything"
    edge_cache_ttl    = 604800
    browser_cache_ttl = 86400
  }
}

resource "cloudflare_page_rule" "cache_media" {
  zone_id  = var.zone_id
  target   = "${var.cdn_hostname}/media/*"
  priority = 2

  actions {
    cache_level       = "cache_everything"
    edge_cache_ttl    = 86400
    browser_cache_ttl = 3600
  }
}

resource "cloudflare_page_rule" "bypass_api" {
  zone_id  = var.zone_id
  target   = "${var.api_hostname}/api/v1/*"
  priority = 3

  actions {
    cache_level = "bypass"
  }
}
