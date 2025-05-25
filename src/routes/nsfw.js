import express from 'express';
import multer from 'multer';
import { detectImage, detectImages } from '../controllers/nsfwController.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// 上传配置
const UPLOAD_CONFIG = {
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    MAX_FILES: 20,                    // 最大文件数量
    UPLOAD_DIR: 'uploads/'            // 上传目录
};

// 定期清理临时文件的函数
const cleanupTempFiles = () => {
    const uploadsDir = UPLOAD_CONFIG.UPLOAD_DIR;
    try {
        if (!fs.existsSync(uploadsDir)) {
            return;
        }
        
        const files = fs.readdirSync(uploadsDir);
        const now = Date.now();
        
        files.forEach(file => {
            const filePath = path.join(uploadsDir, file);
            try {
                const stats = fs.statSync(filePath);
                // 删除超过1小时的临时文件
                if (now - stats.mtime.getTime() > 3600000) {
                    fs.unlinkSync(filePath);
                    console.log(`已清理过期临时文件: ${file}`);
                }
            } catch (err) {
                console.error(`清理文件失败 ${file}:`, err);
            }
        });
    } catch (err) {
        console.error('清理临时文件目录失败:', err);
    }
};

// 每小时执行一次清理
setInterval(cleanupTempFiles, 3600000);

// 程序启动时执行一次清理
cleanupTempFiles();

// 程序退出时执行清理
process.on('SIGINT', () => {
    console.log('正在清理临时文件...');
    cleanupTempFiles();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('正在清理临时文件...');
    cleanupTempFiles();
    process.exit(0);
});

// 允许的图片类型
const ALLOWED_MIMETYPES = [
    'image/jpg',
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

// 文件过滤器
const fileFilter = (req, file, cb) => {
    try {
        // 检查文件是否为空
        if (!file || !file.originalname) {
            return cb(new Error('请选择要上传的图片文件'), false);
        }

        // 检查文件扩展名
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ext) {
            return cb(new Error('文件缺少扩展名，请确保文件格式正确'), false);
        }

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            return cb(new Error(
                `不支持的文件格式：${ext}\n` +
                `支持的格式包括：${ALLOWED_EXTENSIONS.join('、')}\n` +
                '请将文件转换为支持的格式后重试'
            ), false);
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
            return cb(new Error(
                `不支持的图片格式：${file.mimetype}\n` +
                `支持的格式包括：${ALLOWED_MIMETYPES.join('、')}\n` +
                '请将图片转换为支持的格式后重试'
            ), false);
        }

        // 检查文件数量
        const currentFiles = req.files || [];
        if (currentFiles.length >= UPLOAD_CONFIG.MAX_FILES) {
            return cb(new Error('FILE_COUNT_LIMIT_EXCEEDED'), false);
        }

        cb(null, true);
    } catch (error) {
        console.error('文件验证错误:', error);
        cb(new Error('文件验证过程发生错误，请重试或联系管理员'), false);
    }
};

const upload = multer({
    dest: UPLOAD_CONFIG.UPLOAD_DIR,
    limits: {
        fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
        files: UPLOAD_CONFIG.MAX_FILES
    },
    fileFilter
});

// 错误处理中间件
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({ 
                    error: '文件大小超出限制',
                    message: `单个文件大小不能超过 ${UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB，请压缩图片后重试`,
                    details: {
                        maxSize: `${UPLOAD_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
                        currentSize: err.message.includes('bytes') ? 
                            `${Math.round(parseInt(err.message.match(/\d+/)[0]) / 1024 / 1024)}MB` : 
                            '未知'
                    }
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({ 
                    error: '文件数量超出限制',
                    message: `已达到最大上传数量限制（${UPLOAD_CONFIG.MAX_FILES}个文件）`,
                    details: {
                        maxFiles: UPLOAD_CONFIG.MAX_FILES,
                        help: '请分批上传文件，每批不超过' + UPLOAD_CONFIG.MAX_FILES + '个文件'
                    }
                });
            case 'LIMIT_UNEXPECTED_FILE':
                // 检查请求中的字段名
                const fieldNames = Object.keys(req.body);
                const fileFields = Object.keys(req.files || {});
                return res.status(400).json({ 
                    error: '文件字段名错误',
                    message: '请使用正确的字段名上传图片：\n' +
                            '- 单张图片使用 "image"\n' +
                            '- 多张图片使用 "images"',
                    details: {
                        correctFields: {
                            single: 'image',
                            multiple: 'images'
                        },
                        receivedFields: {
                            body: fieldNames,
                            files: fileFields
                        },
                        help: '请检查您的请求中是否使用了正确的字段名。如果是多图片上传，请确保使用 "images" 作为字段名。'
                    }
                });
            default:
                return res.status(400).json({ 
                    error: '文件上传错误',
                    message: '上传过程中发生错误，请检查文件格式和大小后重试',
                    details: {
                        errorCode: err.code,
                        errorMessage: err.message,
                        help: '请确保：\n' +
                              '1. 使用正确的字段名（单图：image，多图：images）\n' +
                              '2. 文件格式正确（支持：jpg、jpeg、png、gif、webp等）\n' +
                              '3. 文件大小在限制范围内'
                    }
                });
        }
    } else if (err) {
        // 处理其他类型的错误
        if (err.message === 'FILE_COUNT_LIMIT_EXCEEDED') {
            return res.status(400).json({
                error: '文件数量超出限制',
                message: `已达到最大上传数量限制（${UPLOAD_CONFIG.MAX_FILES}个文件）`,
                details: {
                    maxFiles: UPLOAD_CONFIG.MAX_FILES,
                    help: '请分批上传文件，每批不超过' + UPLOAD_CONFIG.MAX_FILES + '个文件'
                }
            });
        }
        
        return res.status(400).json({
            error: '上传失败',
            message: err.message || '文件上传失败，请重试',
            details: {
                errorType: err.name,
                errorMessage: err.message,
                help: '请检查：\n' +
                      '1. 请求格式是否正确\n' +
                      '2. 是否使用了正确的字段名\n' +
                      '3. 文件是否符合要求'
            }
        });
    }
    next(err);
};

// 单图片上传路由
router.post('/classify', upload.single('image'), handleMulterError, detectImage);

// 多图片上传路由
router.post('/classify-multiple', 
    upload.array('images', UPLOAD_CONFIG.MAX_FILES), 
    handleMulterError, 
    detectImages
);

export default router; 