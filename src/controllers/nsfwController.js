import { analyzeImage, analyzeImages } from '../services/nsfwService.js';
import fs from 'fs'; // 导入 fs 模块

export const detectImage = async (req, res) => {
    const filePath = req.file?.path;
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请上传图片文件' });
        }

        const result = await analyzeImage(filePath);
        
        res.json(result);
    } catch (error) {
        console.error('图片检测错误:', error);
        res.status(500).json({ error: '图片检测失败' });
    } finally {
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`已清理临时文件 (detectImage): ${filePath}`);
            } catch (unlinkError) {
                console.error(`清理临时文件失败 (detectImage) ${filePath}:`, unlinkError);
            }
        }
    }
};

export const detectImages = async (req, res) => {
    const filesToCleanup = req.files ? req.files.map(f => f.path) : [];
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '请上传图片文件' });
        }

        const imagePaths = req.files.map(file => file.path);
        const results = await analyzeImages(imagePaths);
        
        // 将临时文件路径替换为原始文件名
        const processedResults = results.map((result, index) => ({
            ...result,
            filename: req.files[index].originalname
        }));
        
        res.json({
            success: true,
            results: processedResults
        });
    } catch (error) {
        console.error('批量图片检测错误:', error);
        res.status(500).json({ error: '批量图片检测失败' });
    } finally {
        filesToCleanup.forEach(filePath => {
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                    console.log(`已清理临时文件 (detectImages): ${filePath}`);
                } catch (unlinkError) {
                    console.error(`清理临时文件失败 (detectImages) ${filePath}:`, unlinkError);
                }
            }
        });
    }
}; 