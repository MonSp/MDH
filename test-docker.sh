#!/bin/bash

echo "=== 测试Docker Compose配置 ==="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "错误: Docker未安装"
    exit 1
fi

# 检查docker-compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "错误: docker-compose未安装"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "警告: .env文件不存在，复制示例文件..."
    cp .env.example .env
    echo "请编辑.env文件设置DEEPSEEK_API_KEY"
fi

# 构建镜像
echo "构建Docker镜像..."
docker-compose build

# 启动服务
echo "启动服务..."
docker-compose up -d

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose ps

# 测试前端
echo "测试前端..."
if curl -s http://localhost:8080 > /dev/null; then
    echo "前端服务正常: http://localhost:8080"
else
    echo "前端服务异常"
fi

# 测试后端
echo "测试后端..."
if curl -s http://localhost:8765/health > /dev/null; then
    echo "后端服务正常: http://localhost:8765/health"
else
    echo "后端服务异常"
fi

echo "=== 测试完成 ==="