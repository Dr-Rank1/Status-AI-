/**
 * Ephemeral worker — no network, no fs, eval only allowlisted Function body.
 */
import { parentPort, workerData } from 'worker_threads';

const FORBIDDEN = /\b(require|process|global|globalThis|Function|eval|import|fetch|XMLHttpRequest|WebSocket|child_process|fs)\b/;

try {
  const { script, input } = workerData ?? {};
  if (typeof script !== 'string' || script.length > 4000) {
    throw new Error('Invalid script');
  }
  if (FORBIDDEN.test(script)) {
    throw new Error('Script contains forbidden identifiers');
  }

  // eslint-disable-next-line no-new-func
  const fn = new Function('input', `"use strict";\n${script}\n;`);
  const result = fn(Object.freeze(structuredClone(input)));
  parentPort.postMessage({ result });
} catch (err) {
  parentPort.postMessage({ error: err.message ?? String(err) });
}
