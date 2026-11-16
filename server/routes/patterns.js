import express from 'express'
import multer from 'multer'
import path from 'path'
import { mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const router = express.Router()
const currentFile = fileURLToPath(import.meta.url)
const uploadDirectory = path.resolve(path.dirname(currentFile), '..', 'uploads')

mkdirSync(uploadDirectory, { recursive: true })

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const extensionByMimeType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, uploadDirectory),
  filename: (_req, file, callback) => {
    const extension = extensionByMimeType[file.mimetype]
    callback(null, `pattern-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Only JPG, PNG, and WebP pattern images are allowed.'))
      return
    }
    callback(null, true)
  }
})

router.post('/', (req, res) => {
  upload.single('pattern')(req, res, error => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ message: 'Pattern image must be 10 MB or smaller.' })
      return
    }
    if (error) {
      res.status(400).json({ message: error.message })
      return
    }
    if (!req.file) {
      res.status(400).json({ message: 'A pattern image is required.' })
      return
    }

    res.status(201).json({
      message: 'Pattern uploaded successfully.',
      filename: req.file.filename,
      url: `/api/pattern-files/${req.file.filename}`
    })
  })
})

export default router
