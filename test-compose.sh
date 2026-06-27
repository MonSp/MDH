#!/bin/bash

echo "=== 测试Docker Compose配置 ==="

# 检查docker-compose.yml语法
echo "检查docker-compose.yml语法..."
if docker-compose config > /dev/null 2>&1; then
    echo "✓ docker-compose.yml语法正确"
else
    echo "✗ docker-compose.yml语法错误"
    docker-compose config
    exit 1
fi

# 检查Dockerfile.frontend
echo "检查Dockerfile.frontend..."
if [ -f Dockerfile.frontend ]; then
    echo "✓ Dockerfile.frontend存在"
else
    echo "✗ Dockerfile.frontend不存在"
    exit 1
fi

# 检查Dockerfile.backend
echo "检查Dockerfile.backend..."
if [ -f backend/Dockerfile.backend ]; then
    echo "✓ Dockerfile.backend存在"
else
    echo "✗ Dockerfile.backend不存在"
    exit 1
fi

# 检查nginx.conf
echo "检查nginx.conf..."
if [ -f nginx.conf ]; then
    echo "✓ nginx.conf存在"
else
    echo "✗ nginx.conf不存在"
    exit 1
fi

# 检查.env文件
echo "检查.env文件..."
if [ -f .env ]; then
    echo "✓ .env存在"
else
    echo "⚠ .env不存在（将使用.env.example）"
fi

echo ""
echo "=== 配置检查完成 ==="
echo ""
echo "如果所有检查都通过，可以运行以下命令部署："
echo ""
echo "  docker-compose build"
echo "  docker-compose up -d"
echo ""
echo "或者运行部署脚本："
echo ""
echo "  ./deploy.sh"
echo ""