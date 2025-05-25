import * as nsfwjs from 'nsfwjs-patched';
import * as tf from '@tensorflow/tfjs-node';
import { myLoadImage, ImageProcessor } from '../utils/imageUtils.js';

let model; // 全局模型变量，用于缓存加载后的模型

// 异步加载NSFW检测模型
const loadModel = async () => {
    if (!model) { // 检查模型是否已加载
        tf.enableProdMode(); // 启用生产模式以优化性能
        console.log("当前TensorFlow.js后端:", tf.getBackend()); 
        const modelName = "inception_v3"; // 指定要加载的模型名称
        // 从本地文件系统加载模型。模型文件应位于 /models/inception_v3/ 目录下
        model = await nsfwjs.load(`file://models/${modelName}/`,{size:299});
        console.log(`模型 ${modelName} 加载成功`);
    }
    return model; // 返回加载或已缓存的模型
};

// 分析单个图片
export const analyzeImage = async (imagePath) => {
    let image; // 在此处声明图像张量变量，以便在 finally 块中访问并释放
    try {
        const currentModel = await loadModel(); // 获取模型实例
        image = await myLoadImage(imagePath); // 加载并预处理图片，返回Tensor对象
        
        // 检查图片是否成功加载和处理
        if (!image) { 
            throw new Error('无法加载图片或图片处理失败');
        }
        
        const predictions = await currentModel.classify(image); // 使用模型进行分类
        
        // 将预测结果映射为期望的格式
        const result = {
            porn: predictions.find(p => p.className === 'Porn')?.probability || 0,
            sexy: predictions.find(p => p.className === 'Sexy')?.probability || 0,
            hentai: predictions.find(p => p.className === 'Hentai')?.probability || 0,
            neutral: predictions.find(p => p.className === 'Neutral')?.probability || 0,
            drawing: predictions.find(p => p.className === 'Drawing')?.probability || 0
        };
        return result;
    } catch (error) {
        console.error('图片分析错误 (analyzeImage):', error);
        throw error; // 重新抛出错误，由控制器处理HTTP响应
    } finally {
        // 确保在操作完成后释放Tensor内存
        if (image && typeof image.dispose === 'function') {
            image.dispose();
            console.log('Tensor已在analyzeImage中释放');
        }
    }
};

// 分析多个图片（批量处理）
export const analyzeImages = async (imagePaths) => {
    try {
        const currentModel = await loadModel(); // 获取模型实例
        const imageProcessor = new ImageProcessor(); // 创建ImageProcessor实例用于批量加载
        const images = await imageProcessor.loadManyImages(imagePaths); // 批量加载并预处理图片
        
        // 并行处理所有图片分析
        const results = await Promise.all(
            images.map(async (imgTensor, index) => { // imgTensor是单个图片的Tensor对象
                try {
                    // 检查单个图片是否成功加载和处理
                    if (!imgTensor) { 
                         return {
                            filename: imagePaths[index],
                            error: '图片加载或处理失败'
                        };
                    }
                    const predictions = await currentModel.classify(imgTensor); // 使用模型进行分类
                    
                    // 将预测结果映射为期望的格式
                    const result = {
                        filename: imagePaths[index], // 保留原始文件名
                        prediction: {
                            porn: predictions.find(p => p.className === 'Porn')?.probability || 0,
                            sexy: predictions.find(p => p.className === 'Sexy')?.probability || 0,
                            hentai: predictions.find(p => p.className === 'Hentai')?.probability || 0,
                            neutral: predictions.find(p => p.className === 'Neutral')?.probability || 0,
                            drawing: predictions.find(p => p.className === 'Drawing')?.probability || 0
                        }
                    };
                    return result;
                } catch (error) {
                    console.error(`处理文件 ${imagePaths[index]} 时出错:`, error);
                    return { // 如果单个图片处理失败，返回错误信息
                        filename: imagePaths[index],
                        error: error.message || '处理失败'
                    };
                } finally {
                    // 确保在每个图片处理完成后释放其Tensor内存
                    if (imgTensor && typeof imgTensor.dispose === 'function') {
                        // imageProcessor.disposeImage(imgTensor) 内部也是调用 imgTensor.dispose()
                        imgTensor.dispose(); 
                        console.log(`Tensor已为 ${imagePaths[index]} 在analyzeImages中释放`);
                    }
                }
            })
        );

        return results;
    } catch (error) {
        console.error('批量图片分析错误 (analyzeImages):', error);
        throw error; // 重新抛出错误，由控制器处理HTTP响应
    }
}; 