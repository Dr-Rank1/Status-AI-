import {
  pinFromFile,
  pinFromUrl,
  pinCharacterAsset,
  pinPostImage,
  attachCidToCharacter,
  resolveMediaUrl,
} from '../services/decentralizedStorageService.js';
import { validationError } from '../utils/errors.js';

export async function pinUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const pin = await pinFromFile(req.file.path, {
    filename: req.file.filename,
    mimeType: req.file.mimetype,
  });

  res.status(201).json({
    data: {
      cid: pin.cid,
      gatewayUrl: pin.gatewayUrl,
      provider: pin.provider,
      fallbackUrl: req.file ? `/uploads/${req.file.filename}` : null,
    },
  });
}

export async function pinRemoteUrl(req, res) {
  const { url } = req.body;
  if (!url?.trim()) {
    throw validationError('url is required');
  }

  const pin = await pinFromUrl(url.trim());
  res.status(201).json({ data: pin });
}

export async function pinCharacter(req, res) {
  const { characterId } = req.params;
  const { assetType = 'avatar', url } = req.body;

  if (req.file) {
    const result = await pinCharacterAsset({
      characterId,
      filePath: req.file.path,
      assetType,
    });
    return res.status(201).json({ data: result });
  }

  if (url) {
    const pin = await pinFromUrl(url);
    const updates =
      assetType === 'model'
        ? { modelCid: pin.cid }
        : { avatarCid: pin.cid };
    const character = await attachCidToCharacter(characterId, updates);
    return res.status(201).json({ data: { ...pin, character } });
  }

  throw validationError('file or url required');
}

export async function pinPost(req, res) {
  const { postId } = req.params;

  if (!req.file) {
    throw validationError('file required');
  }

  const result = await pinPostImage({ postId, filePath: req.file.path });
  res.status(201).json({ data: result });
}

export async function resolveMedia(req, res) {
  const { url, ipfsCid, arweaveTxid } = req.query;
  const resolved = resolveMediaUrl({
    url: url ?? null,
    ipfsCid: ipfsCid ?? null,
    arweaveTxid: arweaveTxid ?? null,
  });
  res.json({ data: { url: resolved } });
}
