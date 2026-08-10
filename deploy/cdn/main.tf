# Status Global Edge CDN — CloudFront + optional Cloudflare DNS
#
# Usage:
#   cd deploy/cdn && terraform init && terraform apply -var="domain=cdn.status.app"

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "domain" {
  description = "CDN hostname (e.g. cdn.status.app)"
  type        = string
  default     = "cdn.status.app"
}

variable "origin_bucket" {
  description = "S3 bucket for origin media"
  type        = string
  default     = "status-media-origin"
}

variable "api_origin" {
  description = "API origin for dynamic cache bypass"
  type        = string
  default     = "api.status.app"
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

resource "aws_s3_bucket" "media" {
  bucket = var.origin_bucket
}

resource "aws_cloudfront_origin_access_control" "status_oac" {
  name                              = "status-media-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "status_cdn" {
  enabled             = true
  comment             = "Status global edge — uploads + GLB avatars"
  default_root_object = "index.html"
  aliases             = [var.domain]

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "S3-media"
    origin_access_control_id = aws_cloudfront_origin_access_control.status_oac.id
  }

  origin {
    domain_name = var.api_origin
    origin_id   = "API-origin"
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-media"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 0
    default_ttl = 86400
    max_ttl     = 604800
  }

  ordered_cache_behavior {
    path_pattern           = "/avatars-3d/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-media"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 3600
    default_ttl = 604800
    max_ttl     = 2592000
  }

  ordered_cache_behavior {
    path_pattern           = "/media/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-media"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

    min_ttl     = 300
    default_ttl = 86400
    max_ttl     = 604800
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

output "cloudfront_domain" {
  value = aws_cloudfront_distribution.status_cdn.domain_name
}

output "cdn_base_url" {
  value = "https://${var.domain}"
}
