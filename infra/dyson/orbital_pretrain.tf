# Phase 44 — Dyson / orbital pretrain load balancing (Terraform)
# Hypothetical megastructure routing: schedule LLM pre-training on orbital
# clusters only when solar irradiance ≥ threshold.

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    null = {
      source  = "hashicorp/null"
      version = "~> 3.2"
    }
  }
}

variable "irradiance_wm2" {
  type        = number
  description = "Observed solar irradiance at collector (W/m²)"
  default     = 1200
}

variable "irradiance_min_wm2" {
  type    = number
  default = 950
}

variable "workload_type" {
  type    = string
  default = "pretrain"
}

locals {
  irradiance_ok = var.irradiance_wm2 >= var.irradiance_min_wm2
  target_cluster = local.irradiance_ok ? "orbital-dyson-ring-1" : "defer-ground-green"
}

resource "null_resource" "orbital_pretrain_gate" {
  triggers = {
    irradiance = var.irradiance_wm2
    target     = local.target_cluster
    workload   = var.workload_type
  }

  provisioner "local-exec" {
    command = <<-EOT
      echo "Dyson gate: irradiance=${var.irradiance_wm2} target=${local.target_cluster}"
      if [ "${local.irradiance_ok}" != "true" ]; then
        echo "Deferring pretrain — irradiance below gate"
        exit 0
      fi
      echo "Routing ${var.workload_type} to ${local.target_cluster}"
    EOT
  }
}

output "pretrain_target" {
  value = local.target_cluster
}

output "irradiance_gate_open" {
  value = local.irradiance_ok
}
