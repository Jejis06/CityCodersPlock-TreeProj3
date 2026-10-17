import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../lib/config.js';
import { HttpError } from '../lib/http.js';

mkdirSync(config.uploadsDir, { recursive: true });

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif|svg\+xml)|application\/pdf)$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (_req, file, cb) => {
      cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Dozwolone są tylko obrazy (JPG, PNG, WEBP, GIF, SVG) i PDF.'));
    }
  },
});

export const uploadsRouter = Router();

uploadsRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'Brak pliku (pole formularza "file").');
  }
  res.status(201).json({
    url: `/uploads/${req.file.filename}`,
    original_name: req.file.originalname,
    size: req.file.size,
    mime_type: req.file.mimetype,
  });
});
