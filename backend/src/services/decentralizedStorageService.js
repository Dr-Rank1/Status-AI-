/**
 * Decentralized media pinning — IPFS (primary) and Arweave (optional mirror).
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const IPFS_GATEWAY = (process.env.IPFS_GATEWAY ?? 'https://ipfs.io/ipfs').replace(/\/$/, '');
const IPFS_API_URL = process.env.IPFS_API_URL ?? '';
const ARWEAVE_GATEWAY = (process.env.ARWEAVE_GATEWAY ?? 'https://arweave.net').replace(/\/$/, '');
const MOCK_MODE = process.env.IPFS_MOCK_MODE !== 'false' && !IPFS_API_URL;

function mockCid(buffer) {
  const hash = crypto.createHash('sha256').update(buffer).digest();
  return `bafy${hash.toString('hex').slice(0, 58)}`;
}

function cidToUrl(cid) {
  return `${IPFS_GATEWAY}/${cid}`;
}

export async function pinBuffer(buffer, { filename = 'asset.bin', mimeType = 'application/octet-stream' } = {}) {
  if (MOCK_MODE) {
    const cid = mockCid(buffer);
    logger.info(`[IPFS] Mock pin ${filename} → ${cid}`);
    return { cid, gatewayUrl: cidToUrl(cid), provider: 'mock', size: buffer.length, mimeType };
  }

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), filename);

  const response = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`IPFS pin failed: ${err}`);
  }

  const data = await response.json();
  const cid = data.Hash ?? data.cid;
  return { cid, gatewayUrl: cidToUrl(cid), provider: 'ipfs', size: buffer.length, mimeType };
}

export async function pinFromFile(filePath, options = {}) {
  const buffer = await fs.readFile(filePath);
  const filename = options.filename ?? filePath.split('/').pop();
  return pinBuffer(buffer, { ...options, filename });
}

export async function pinFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset for pinning: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream';
  return pinBuffer(buffer, { filename: url.split('/').pop() ?? 'asset', mimeType });
}

export async function mirrorToArweave(buffer, { tags = {} } = {}) {
  if (!process.env.ARWEAVE_WALLET_JWK) {
    const txid = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 43);
    logger.info(`[Arweave] Mock mirror → ${txid}`);
    return { txid, gatewayUrl: `${ARWEAVE_GATEWAY}/${txid}`, provider: 'mock' };
  }

  // Production: integrate arweave SDK upload with JWK wallet
  throw new Error('Arweave upload requires ARWEAVE_WALLET_JWK configuration');
}

export async function attachCidToCharacter(characterId, { avatarCid, modelCid, arweaveTxid }) {
  const { rows } = await query(
    `UPDATE ai_characters
     SET ipfs_avatar_cid = COALESCE($2, ipfs_avatar_cid),
         ipfs_model_cid = COALESCE($3, ipfs_model_cid),
         arweave_avatar_txid = COALESCE($4, arweave_avatar_txid),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, avatar_url, model_3d_url, ipfs_avatar_cid, ipfs_model_cid, arweave_avatar_txid`,
    [characterId, avatarCid ?? null, modelCid ?? null, arweaveTxid ?? null],
  );
  return rows[0];
}

export async function attachCidToPost(postId, { imageCid, arweaveTxid }) {
  const { rows } = await query(
    `UPDATE posts
     SET ipfs_image_cid = COALESCE($2, ipfs_image_cid),
         arweave_image_txid = COALESCE($3, arweave_image_txid),
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, image_url, ipfs_image_cid, arweave_image_txid`,
    [postId, imageCid ?? null, arweaveTxid ?? null],
  );
  return rows[0];
}

export function resolveMediaUrl({ url, ipfsCid, arweaveTxid }) {
  if (ipfsCid) return cidToUrl(ipfsCid);
  if (arweaveTxid) return `${ARWEAVE_GATEWAY}/${arweaveTxid}`;
  return url ?? null;
}

export async function pinCharacterAsset({ characterId, filePath, assetType = 'avatar' }) {
  const pin = await pinFromFile(filePath);
  const updates =
    assetType === 'model'
      ? { modelCid: pin.cid }
      : { avatarCid: pin.cid };

  const character = await attachCidToCharacter(characterId, updates);
  return { ...pin, character };
}

export async function pinPostImage({ postId, filePath }) {
  const pin = await pinFromFile(filePath);
  const post = await attachCidToPost(postId, { imageCid: pin.cid });
  return { ...pin, post };
}
