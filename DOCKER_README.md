# Docker Compose 部署指南

## 前提条件

1. 安装 Docker
2. 安装 Docker Compose

## 快速开始

### 1. 配置环境变量

复制环境变量示例文件并编辑：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置必要的环境变量：

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 2. 构建并启动服务

```bash
# 构建镜像
docker-compose build

# 启动服务（后台运行）
docker-compose up -d
```

### 3. 访问服务

- 前端：http://localhost:8080
- 后端API：http://localhost:8765
- 健康检查：http://localhost:8765/health

### 4. 查看日志

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs frontend
docker-compose logs backend

# 实时查看日志
docker-compose logs -f
```

### 5. 停止服务

```bash
# 停止服务
docker-compose down

# 停止服务并删除卷
docker-compose down -v
```

## 开发模式

### 重新构建

```bash
# 重新构建所有服务
docker-compose build

# 重新构建特定服务
docker-compose build frontend
docker-compose build backend
```

### 进入容器

```bash
# 进入前端容器
docker-compose exec frontend sh

# 进入后端容器
docker-compose exec backend bash
```

## 故障排除

### 1. 端口冲突

如果端口被占用，修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "8081:80"  # 前端改为8081
  - "8766:8765"  # 后端改为8766
```

### 2. 构建失败

清理Docker缓存：

```bash
docker system prune -a
docker-compose build --no-cache
```

### 3. 服务无法启动

检查日志：

```bash
docker-compose logs
```

## 生产环境部署

### 1. 使用环境变量

```bash
export DEEPSEEK_API_KEY=your_production_key
docker-compose up -d
```

### 2. 使用.env文件

```bash
# 生产环境使用不同的.env文件
cp .env.production .env
docker-compose up -d
```

### 3. 反向代理配置

如果使用Nginx反向代理，配置示例：

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api/ {
        proxy_pass http://localhost:8765/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ws/ {
        proxy_pass http://localhost:8765/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 数据持久化

后端数据存储在Docker卷 `backend-data` 中，包含：

- 技能包数据
- 项目数据
- 其他运行时数据

备份数据：

```bash
# 导出卷数据
docker run --rm -v test-sidepanel-host_backend-data:/data -v $(pwd):/backup alpine tar czf /backup/backend-data-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v test-sidepanel-host_backend-data:/data -v $(pwd):/backup alpine tar xzf /backup/backend-data-backup.tar.gz -C /data
```