# NSFW 图片检测服务

基于 TensorFlow.js 的图片内容检测服务。

## 快速开始

### Docker 部署
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 本地运行
```bash
npm install
npm run dev
```

## API 接口

- 健康检查：`GET /api/nsfw/health`
- 单图检测：`POST /api/nsfw/classify` (multipart/form-data, field: image)
- 多图检测：`POST /api/nsfw/classify-multiple` (multipart/form-data, field: images)

支持格式：jpg, jpeg, png, gif, webp, avif
文件大小限制：100MB

### 返回格式

单图检测返回：
```json
{
    "drawing": 0.01,
    "hentai": 0.02,
    "neutral": 0.95,
    "porn": 0.01,
    "sexy": 0.01
}
```

多图检测返回：
```json
{
    "success": true,
    "results": [
        {
            "filename": "image1.jpg",
            "drawing": 0.01,
            "hentai": 0.02,
            "neutral": 0.95,
            "porn": 0.01,
            "sexy": 0.01
        },
        {
            "filename": "image2.jpg",
            "drawing": 0.02,
            "hentai": 0.01,
            "neutral": 0.96,
            "porn": 0.00,
            "sexy": 0.01
        }
    ]
}
```

## 环境要求

- Node.js 20+
- Docker (可选)

## 注意事项

- 生产环境需要足够的内存和 CPU 资源 