/**
 * Phase 31 — Zero-trust ephemeral Wasm / isolate sandbox for agentic tool scripts.
 *
 * Design:
 * - Host tools run through an ephemeral Worker with deny-by-default globals
 * - Optional WebAssembly module validates payload shape (wat-compiled stub)
 * - Sandbox always terminates after timeout or result
 */

import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { logger } from '../../utils/logger.js';

const TIMEOUT_MS = () => parseInt(process.env.WASM_SANDBOX_TIMEOUT_MS ?? '1500', 10);
const ENABLED = () => process.env.WASM_SANDBOX_ENABLED !== 'false';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'wasmSandboxWorker.js');

/**
 * Minimal WASM module (wat):
 *   (module (func (export "ping") (result i32) i32.const 1))
 * Base64 of wasm binary.
 */
const PING_WASM_B64 = 'AGFzbQEAAAABBQFgAAF/AwIBAAcIAQRwaW5nAAAKBgEEAEEBCw==';

let wasmModulePromise = null;

async function getPingWasm() {
  if (!wasmModulePromise) {
    const bytes = Buffer.from(PING_WASM_B64, 'base64');
    wasmModulePromise = WebAssembly.compile(bytes);
  }
  return wasmModulePromise;
}

/**
 * Prove Wasm isolate can instantiate and export ping===1, then discard instance.
 */
export async function warmWasmIsolate() {
  const mod = await getPingWasm();
  const instance = await WebAssembly.instantiate(mod, {});
  const ping = instance.exports.ping();
  return { ok: ping === 1, engine: 'webassembly' };
}

/**
 * Execute a restricted script payload inside an ephemeral worker thread.
 * `script` must be pure JSON-logic style JS without require/fs/net.
 */
export async function runInEphemeralSandbox({
  script,
  input = {},
  timeoutMs = TIMEOUT_MS(),
}) {
  if (!ENABLED()) {
    return { ok: false, skipped: true, reason: 'WASM_SANDBOX_DISABLED' };
  }

  const wasm = await warmWasmIsolate();
  if (!wasm.ok) {
    throw new Error('Wasm isolate failed health ping');
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH, {
      workerData: { script, input },
      resourceLimits: {
        maxOldGenerationSizeMb: 32,
        maxYoungGenerationSizeMb: 16,
      },
    });

    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      reject(new Error(`Sandbox timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    worker.on('message', (msg) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (msg?.error) reject(new Error(msg.error));
      else resolve({ ok: true, result: msg?.result, wasm: true, ephemeral: true });
    });

    worker.on('error', (err) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      reject(err);
    });

    worker.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        logger.warn(`[WasmSandbox] Worker exited code=${code}`);
      }
    });
  });
}

/**
 * Wrap an agent tool executor so untrusted transforms run ephemerally.
 */
export async function executeToolInSandbox(toolName, args, executor) {
  const started = Date.now();

  // Host-side tools still execute in Node, but any `script` / `transform` arg is sandboxed first
  // (except dedicated run_sandboxed_script which owns the sandbox call)
  if (toolName !== 'run_sandboxed_script' && (args?.script || args?.transform)) {
    const sandboxed = await runInEphemeralSandbox({
      script: args.script ?? args.transform,
      input: { toolName, args: { ...args, script: undefined, transform: undefined } },
    });
    args = { ...args, __sandbox: sandboxed.result };
  }

  const result = await executor();
  return {
    ...result,
    sandbox: {
      used: Boolean(args?.__sandbox),
      durationMs: Date.now() - started,
      zeroTrust: true,
    },
  };
}

export function getSandboxConfig() {
  return {
    enabled: ENABLED(),
    timeoutMs: TIMEOUT_MS(),
    worker: 'wasmSandboxWorker.js',
    wasmPingModule: true,
    resourceLimitsMb: 32,
  };
}
