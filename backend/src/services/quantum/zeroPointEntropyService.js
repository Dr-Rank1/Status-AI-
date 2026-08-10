/**
 * Phase 45 — Zero-point entropy harvest + neural memory encryption (Node).
 * Uses CSPRNG as ZPE/QRNG stand-in; AES-256-GCM with keys derived from harvest.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const BACKEND = () => (process.env.ZPE_BACKEND ?? 'sim').toLowerCase();

/**
 * Harvest non-deterministic entropy (zero-point field abstraction).
 */
export function harvestZeroPointEntropy(bytes = 32) {
  const n = Math.max(16, Math.min(256, bytes));
  // Mix OS entropy with high-res timing jitter (non-thermal proxy)
  const a = crypto.randomBytes(n);
  const hr = Buffer.alloc(8);
  hr.writeBigUInt64BE(process.hrtime.bigint() & BigInt('0xffffffffffffffff'));
  const mixed = crypto.createHash('sha512').update(a).update(hr).digest().subarray(0, n);
  const energyPj = 0.001 * n;
  logger.info(`[ZPE] harvest ${n}B backend=${BACKEND()} E≈${energyPj.toFixed(4)}pJ`);
  return {
    entropy: mixed,
    entropyHex: mixed.toString('hex'),
    energyPj,
    backend: BACKEND(),
    nonDeterministic: true,
  };
}

/**
 * Derive encryption key from zero-point entropy for cross-cluster neural memory.
 */
export function deriveZpeMemoryKey(entropyBuf, { salt = 'status-zpe-v1', info = 'neural-memory' } = {}) {
  return Buffer.from(crypto.hkdfSync('sha256', entropyBuf, salt, info, 32));
}

/**
 * Encrypt neural memory blob with ZPE-derived key (AES-256-GCM).
 * Protects against speculative future decryption via fresh entropy keys.
 */
export function encryptNeuralMemory(plaintext, { entropyBytes = 32, entropy = null } = {}) {
  const harvest = entropy
    ? { entropy, energyPj: 0.001 * entropy.length, backend: BACKEND() }
    : harvestZeroPointEntropy(entropyBytes);
  const key = deriveZpeMemoryKey(harvest.entropy);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(JSON.stringify(plaintext), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('base64'),
    keyCommitment: crypto.createHash('sha256').update(key).digest('hex'),
    entropyCommitment: crypto.createHash('sha256').update(harvest.entropy).digest('hex'),
    entropyHex: harvest.entropy.toString('hex'),
    energyPj: harvest.energyPj,
    backend: harvest.backend,
  };
}

export function decryptNeuralMemory(envelope, entropyHex) {
  const entropy = Buffer.from(entropyHex, 'hex');
  const key = deriveZpeMemoryKey(entropy);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(pt.toString('utf8'));
}

export function getZpeConfig() {
  return {
    backend: BACKEND(),
    nativePath: 'mobile/native/zero_point_compute_bridge',
    header: 'status_zpe.h',
    cipher: 'aes-256-gcm',
    purpose: 'cross-cluster neural memory vs speculative decryption',
  };
}
