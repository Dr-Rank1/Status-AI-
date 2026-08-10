#!/usr/bin/env bash
# Bootstrap self-hosted vLLM with Llama-3 Instruct (OpenAI-compatible API on :8000).
#
# Usage:
#   ./deploy/vllm/setup-vllm.sh
#   VLLM_MODEL=meta-llama/Meta-Llama-3-8B-Instruct ./deploy/vllm/setup-vllm.sh
#
# Requires: Docker, NVIDIA GPU + nvidia-container-toolkit (recommended)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VLLM_MODEL="${VLLM_MODEL:-meta-llama/Meta-Llama-3-8B-Instruct}"
VLLM_PORT="${VLLM_PORT:-8000}"
HF_TOKEN="${HF_TOKEN:-}"

echo "=== Status vLLM Setup ==="
echo "Model: $VLLM_MODEL"
echo "Port:  $VLLM_PORT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required." >&2
  exit 1
fi

mkdir -p "$ROOT/data/vllm/huggingface"

export VLLM_MODEL VLLM_PORT HF_TOKEN
docker compose -f "$ROOT/deploy/vllm/docker-compose.yml" up -d

echo
echo "Waiting for vLLM health..."
for i in $(seq 1 60); do
  if curl -sf "http://127.0.0.1:${VLLM_PORT}/v1/models" >/dev/null 2>&1; then
    echo "vLLM is ready at http://127.0.0.1:${VLLM_PORT}/v1"
    echo
    echo "Configure backend (.env):"
    echo "  VLLM_BASE_URL=http://127.0.0.1:${VLLM_PORT}/v1"
    echo "  VLLM_MODEL=${VLLM_MODEL}"
    echo "  SELF_HOSTED_AI_PREFERRED=true"
    exit 0
  fi
  sleep 5
done

echo "vLLM did not become healthy in time. Check: docker logs status-vllm" >&2
exit 1
