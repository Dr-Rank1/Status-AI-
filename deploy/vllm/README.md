# vLLM Self-Hosted Inference

Serves **Meta Llama 3 Instruct** via an OpenAI-compatible API on port **8000**, replacing external LLM calls for core AI characters.

## Quick start

```bash
# Optional — required for gated Llama weights on Hugging Face
export HF_TOKEN=hf_...

chmod +x deploy/vllm/setup-vllm.sh
./deploy/vllm/setup-vllm.sh
```

Verify:

```bash
curl http://localhost:8000/v1/models
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"meta-llama/Meta-Llama-3-8B-Instruct","messages":[{"role":"user","content":"Hello"}]}'
```

## Backend configuration

Add to `backend/.env`:

```env
VLLM_BASE_URL=http://127.0.0.1:8000/v1
VLLM_MODEL=meta-llama/Meta-Llama-3-8B-Instruct
SELF_HOSTED_AI_PREFERRED=true
```

When `SELF_HOSTED_AI_PREFERRED=true`, the AI router prefers `vllm` for DMs and feed generation before cloud providers.

## Production notes

- Use a GPU instance (A10/L4/A100) with `nvidia-container-toolkit`
- Point multiple API regions at a shared vLLM cluster over private networking
- Pair with circuit breakers (Phase 18) — vLLM has its own breaker key `llm-vllm`
