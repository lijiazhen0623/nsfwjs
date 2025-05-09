import * as nsfwjs from 'nsfwjs-patched';
import * as tf from '@tensorflow/tfjs-node-gpu';
import { myLoadImage, ImageProcessor } from '../utils/imageUtils.js';

let model;

const loadModel = async () => {
    if (!model) {
        tf.enableProdMode();
        console.log("当前后端:", tf.getBackend()); 
        const modelName = "inception_v3";
        // model = await nsfwjs.load(modelName);
        model = await nsfwjs.load(`file://models/${modelName}/`,{size:299});
        console.log(`模型${modelName}加载成功`);
    }
    return model;
};

export const analyzeImage = async (imagePath) => {
    try {
        const model = await loadModel();
        const image = await myLoadImage(imagePath);
        const predictions = await model.classify(image);
        const result = {
            porn: predictions.find(p => p.className === 'Porn')?.probability || 0,
            sexy: predictions.find(p => p.className === 'Sexy')?.probability || 0,
            hentai: predictions.find(p => p.className === 'Hentai')?.probability || 0,
            neutral: predictions.find(p => p.className === 'Neutral')?.probability || 0,
            drawing: predictions.find(p => p.className === 'Drawing')?.probability || 0
        };

        return result;
    } catch (error) {
        console.error('图片分析错误:', error);
        throw error;
    }
};

export const analyzeImages = async (imagePaths) => {
    try {
        const model = await loadModel();
        const imageProcessor = new ImageProcessor();
        const images = await imageProcessor.loadManyImages(imagePaths);
        
        const results = await Promise.all(
            images.map(async (image, index) => {
                try {
                    const predictions = await model.classify(image);
                    const result = {
                        filename: imagePaths[index],
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
                    return {
                        filename: imagePaths[index],
                        error: error.message || '处理失败'
                    };
                } finally {
                    imageProcessor.disposeImage(image);
                }
            })
        );

        return results;
    } catch (error) {
        console.error('批量图片分析错误:', error);
        throw error;
    }
}; 