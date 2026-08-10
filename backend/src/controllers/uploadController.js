import { publicUploadUrl } from '../config/upload.js';
import { requireContentModeration } from '../middleware/moderation.js';
import { pinFromFile } from '../services/decentralizedStorageService.js';

export async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  await requireContentModeration({
    userId: req.user?.id,
    imageFile: req.file.path,
    mimetype: req.file.mimetype,
  });

  const url = publicUploadUrl(req.file.filename, req);

  let ipfs = null;
  if (process.env.IPFS_AUTO_PIN === 'true') {
    try {
      ipfs = await pinFromFile(req.file.path, {
        filename: req.file.filename,
        mimeType: req.file.mimetype,
      });
    } catch {
      // non-fatal — local URL remains fallback
    }
  }

  res.status(201).json({
    data: {
      url,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      ipfsCid: ipfs?.cid ?? null,
      ipfsGatewayUrl: ipfs?.gatewayUrl ?? null,
    },
  });
}
