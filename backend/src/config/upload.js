import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
  },
});

function fileFilter(_req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image uploads are allowed'));
  }
}

export const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const audioStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.m4a';
    const safeExt = ['.m4a', '.mp3', '.wav', '.webm', '.ogg', '.mp4'].includes(ext) ? ext : '.m4a';
    cb(null, `voice-${Date.now()}${safeExt}`);
  },
});

function audioFilter(_req, file, cb) {
  if (file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4') {
    cb(null, true);
  } else {
    cb(new Error('Only audio uploads are allowed'));
  }
}

export const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

export function publicUploadUrl(filename, req) {
  const base = process.env.API_BASE_URL ?? `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${filename}`;
}
