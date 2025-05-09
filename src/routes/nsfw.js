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
    'image/heic',
    'image/heif',
    'image/bmp',
    'image/tiff',
    'image/x-tiff'
];

// 允许的文件扩展名
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif'];

const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 100 * 1024 * 1024, // 限制文件大小为 100MB
    },
    fileFilter: (req, file, cb) => {
        try {
            // 检查文件是否为空
            if (!file || !file.originalname) {
                return cb(new Error('无效的文件！'), false);
            }

            // 检查文件扩展名
            const ext = path.extname(file.originalname).toLowerCase();
            if (!ext) {
                return cb(new Error('文件缺少扩展名！'), false);
            }

            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                return cb(new Error(`不支持的文件扩展名：${ext}，支持的扩展名：${ALLOWED_EXTENSIONS.join(', ')}`), false);
            }

            // 如果MIME类型是text/plain，尝试根据扩展名推断正确的MIME类型
            if (file.mimetype === 'text/plain') {
                const mimeMap = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.webp': 'image/webp',
                    '.heic': 'image/heic',
                    '.heif': 'image/heif',
                    '.bmp': 'image/bmp',
                    '.tiff': 'image/tiff',
                    '.tif': 'image/tiff'
                };
                file.mimetype = mimeMap[ext] || file.mimetype;
                console.log(`修正后的MIME类型: ${file.mimetype}`);
            }

            // 检查 MIME 类型
            if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
                return cb(new Error(`不支持的图片格式：${file.mimetype}，支持的格式：${ALLOWED_MIMETYPES.join(', ')}`), false);
            }

            cb(null, true);
        } catch (error) {
            console.error('文件过滤器错误:', error);
            cb(new Error('文件验证过程发生错误！'), false);
        }
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