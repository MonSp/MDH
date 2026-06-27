#!/bin/bash

set -e

echo "=== 部署测试项目到Docker ==="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装${NC}"
    echo "请先安装Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

# 检查docker-compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: docker-compose未安装${NC}"
    echo "请先安装Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}警告: .env文件不存在${NC}"
    echo "正在从示例文件创建..."
    cp .env.example .env
    echo -e "${YELLOW}请编辑.env文件设置DEEPSEEK_API_KEY${NC}"
    echo "文件位置: $(pwd)/.env"
    read -p "按Enter键继续..."
fi

# 检查API密钥
if grep -q "your_api_key_here" .env; then
    echo -e "${YELLOW}警告: DEEPSEEK_API_KEY未设置${NC}"
    echo "请编辑.env文件设置正确的API密钥"
    echo "文件位置: $(pwd)/.env"
    read -p "按Enter键继续..."
fi

echo -e "${GREEN}步骤1: 构建Docker镜像${NC}"
docker-compose build

echo -e "${GREEN}步骤2: 启动服务${NC}"
docker-compose up -d

echo -e "${GREEN}步骤3: 等待服务启动${NC}"
sleep 15

echo -e "${GREEN}步骤4: 检查服务状态${NC}"
docker-compose ps

echo -e "${GREEN}步骤5: 测试服务${NC}"

# 测试前端
echo -n "测试前端服务... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200"; then
    echo -e "${GREEN}成功${NC}"
else
    echo -e "${RED}失败${NC}"
fi

# 测试后端健康检查
echo -n "测试后端健康检查... "
if curl -s http://localhost:8765/health | grep -q "ok"; then
    echo -e "${GREEN}成功${NC}"
else
    echo -e "${RED}失败${NC}"
fi

echo ""
echo -e "${GREEN}=== 部署完成 ===${NC}"
echo ""
echo "访问地址:"
echo "  前端: http://localhost:8080"
echo "  后端: http://localhost:8765"
echo "  健康检查: http://localhost:8765/health"
echo ""
echo "常用命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose down"
echo "  重启服务: docker-compose restart"
echo "  进入容器: docker-compose exec backend bash"
echo ""