# 使用官方 Node.js 镜像作为基础镜像
FROM node:20-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果有）到容器中
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制项目文件到容器中
COPY . .

# 创建上传目录
RUN mkdir -p uploads

# 暴露服务端口（根据你的应用监听的端口进行调整）
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
