import { analyzeImage, analyzeImages } from '../services/nsfwService.js';

export const detectImage = async (req, res) => {
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请上传图片文件' });
        }

        const result = await analyzeImage(req.file.path);
        
        res.json(result);
    } catch (error) {
        console.error('图片检测错误:', error);
        res.status(500).json({ error: '图片检测失败' });
    }
};

export const detectImages = async (req, res) => {
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
    }
}; 