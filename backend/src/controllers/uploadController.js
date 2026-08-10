import { publicUploadUrl } from '../config/upload.js';

export async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

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
