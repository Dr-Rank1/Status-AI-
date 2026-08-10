import { publicUploadUrl } from '../config/upload.js';
import { requireContentModeration } from '../middleware/moderation.js';

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

  res.status(201).json({
    data: {
      url,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
    },
  });
}
