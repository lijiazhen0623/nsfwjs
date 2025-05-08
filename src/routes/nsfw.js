import express from 'express';
import multer from 'multer';
import { detectImage, detectImages } from '../controllers/nsfwController.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// 允许的图片类型
const ALLOWED_MIMETYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif'
];

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 100 * 1024 * 1024, // 限制文件大小为 100MB
    },
    fileFilter: (req, file, cb) => {
        // 检查 MIME 类型
        if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
            return cb(new Error('不支持该格式的图片！'), false);
        }

        // 检查文件扩展名
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error('不支持的文件扩展名！'), false);
        }

        cb(null, true);
    }
});

// 错误处理中间件
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件大小不能超过 100MB！' });
        }
        return res.status(400).json({ error: '文件上传错误：' + err.message });
    }
    next(err);
};

// 清理上传文件的中间件
const cleanupFiles = (req, res, next) => {
    res.on('finish', () => {
        const files = req.files || (req.file ? [req.file] : []);
        files.forEach(file => {
            if (file.path) {
                fs.unlink(file.path, (err) => {
                    if (err) {
                        console.error('文件删除错误:', err);
                    }
                });
            }
        });
    });
    next();
};

// 单图片上传路由
router.post('/classify', upload.single('image'), handleMulterError, cleanupFiles, detectImage);

// 多图片上传路由
router.post('/classify-multiple', upload.array('images', 10), handleMulterError, cleanupFiles, detectImages);

export default router; 