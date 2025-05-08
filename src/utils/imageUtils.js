import * as tf from '@tensorflow/tfjs-node';
import sharp from 'sharp';

export const loadImage = async (imagePath) => {
    try {
        // 使用 sharp 读取图片并转换为 JPEG 格式
        const buffer = await sharp(imagePath)
            .rotate() // 自动旋转
            .resize({
                width: 299,
                height: 299,
                fit: 'cover', // 裁剪而非填充，模型对尺度变化更鲁棒
                position: 'center',
                fastShrinkOnLoad: true
            })
            .removeAlpha()
            .jpeg({
                quality: 90,
                mozjpeg: true,
                chromaSubsampling: '4:4:4'
            })
            .toBuffer();

        // 使用 tf.node.decodeImage 解码图片
        return tf.node.decodeImage(buffer, 3);
    } catch (error) {
        console.error('图片加载错误:', error);
        throw error;
    }
};

export class ImageProcessor {
    async loadImage(imagePath) {
        return loadImage(imagePath);
    }

    async loadManyImages(imagePaths) {
        return await Promise.all(imagePaths.map(path => this.loadImage(path)));
    }

    disposeImage(tensor) {
        if (tensor) {
            tensor.dispose();
        }
    }
} 