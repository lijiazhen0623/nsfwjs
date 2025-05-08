import express from 'express';
import nsfwRoutes from './routes/nsfw.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// 创建上传目录
import fs from 'fs';
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 健康检查路由
app.get('/api/nsfw/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// 路由
app.use('/api/nsfw', nsfwRoutes);

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: '服务器内部错误' });
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
}); 