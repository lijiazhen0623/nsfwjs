import * as tf from '@tensorflow/tfjs-node';
import sharp from 'sharp';
import { createCanvas, loadImage } from 'canvas';

// 高级图像预处理管道：支持 JPEG/PNG/GIF/WEBP
async function optimizeForNSFW(imagePath) {
  // 第一阶段：统一格式转换 -> JPEG (92%质量 + 色度采样)
  const jpegBuffer = await sharp(imagePath)
    .rotate() // 自动旋转（Exif）
    .toFormat('jpeg', {
      quality: 92,
      chromaSubsampling: '4:2:0'
    })
    .toBuffer();

  // 第二阶段：核心图像缩放与色彩处理（299x299）
  const normalizedBuffer = await sharp(jpegBuffer)
    .resize({
      width: 299,
      height: 299,
      fit: 'cover',
      position: 'attention',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false
    })
    .toColourspace('srgb')
    .linear(1.0, 0) // 增强线性对比
    .normalize({ lower: 1, upper: 99 }) // 增强对比度（排除极端值）
    .removeAlpha() // 去除透明通道
    .toBuffer();

  // 第三阶段：加载到 Canvas（兼容性兜底）
  const canvas = createCanvas(299, 299);
  const ctx = canvas.getContext('2d');

  try {
    const img = new Image();
    img.src = normalizedBuffer;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = err => reject(new Error(`Canvas load failed: ${err.message}`));
    });

    ctx.drawImage(img, 0, 0);
  } catch (err) {
    // 如果 Canvas 加载失败，用 raw 数据手动绘制
    const { data } = await sharp(normalizedBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = ctx.createImageData(299, 299);
    new Uint8ClampedArray(imageData.data.buffer).set(data);
    ctx.putImageData(imageData, 0, 0);
  }

  // 第四阶段：输出为 JPEG（锐化处理）
  return sharp(canvas.toBuffer('image/png'))
    .sharpen({ sigma: 0.8 })
    .jpeg({
      quality: 92,
      chromaSubsampling: '4:2:0',
      progressive: true,
      optimiseScans: true
    })
    .toBuffer();
}

export const myLoadImage = async (imagePath) => {
  try {
    const buffer = await optimizeForNSFW(imagePath);
    // const buffer = await sharp(imagePath)
    //     // 基础处理
    //     .rotate() // 保持自动旋转（修正EXIF方向）
    //     .resize({
    //         width: 299,
    //         height: 299,
    //         fit: 'cover',
    //         position: 'attention',      // 改为内容感知裁剪（需要libvips支持）
    //         kernel: sharp.kernel.cubic, // 双三次插值算法（更精确）
    //         fastShrinkOnLoad: false     // 关闭快速缩小（保证缩放质量）
    //     })

    //     // 颜色科学处理
    //     .toColorspace('srgb')        // 强制转换到标准RGB
    //     .linear(1.0, 0)             // 禁用伽马校正（保持线性颜色空间）
    //     .normalise({ upper: 99 })   // 自动对比度拉伸（剪切顶部1%高光）
    //     .removeAlpha()              // 移除透明通道

    //     // 智能降噪处理
    //     .median(3)                  // 3x3中值滤波（消除噪点）
    //     .sharpen({
    //         sigma: 1.1,               // 适度锐化
    //         m1: 0.5,                  // 平面区域处理
    //         m2: 3.0                   // 边缘区域锐化
    //     })

    //     // 输出优化
    //     .jpeg({
    //         quality: 100,
    //         mozjpeg: true,            // MozJPEG优化
    //         chromaSubsampling: '4:4:4', // 全色度采样
    //         trellisQuantisation: true,  // 网格量化优化
    //         overshootDeringing: true    // 消除振铃效应
    //     })
    //     .toBuffer();

    // // 使用 sharp 读取图片并转换为 JPEG 格式
    // const buffer = await sharp(imagePath)
    //     .rotate() // 自动旋转
    //     .resize({
    //         width: 299,
    //         height: 299,
    //         fit: 'cover', // 裁剪而非填充，模型对尺度变化更鲁棒
    //         position: 'center',
    //         fastShrinkOnLoad: true
    //     })
    //     .removeAlpha()
    //     .jpeg({
    //         quality: 100,
    //         mozjpeg: true,
    //         chromaSubsampling: '4:4:4'
    //     })
    //     .toBuffer();

    // 使用 tf.node.decodeImage 解码图片
    return tf.node.decodeImage(buffer, 3);
  } catch (error) {
    console.error('图片加载错误:', error);
    throw error;
  }
};

export class ImageProcessor {
  async myLoadImage(imagePath) {
    return myLoadImage(imagePath);
  }

  async loadManyImages(imagePaths) {
    return await Promise.all(imagePaths.map(path => this.myLoadImage(path)));
  }

  disposeImage(tensor) {
    if (tensor) {
      tensor.dispose();
    }
  }
} 