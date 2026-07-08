# HybridToolkitRouter 设计

## 核心思想

将"在哪里执行"拆分为4个独立维度，用户按需组合：

| 维度 | 选项 | 说明 |
|------|------|------|
| **LLM 推理** | `local` / `remote` | 大模型调用在哪执行 |
| **Agent 实例** | `local` / `remote` | 智能体编排在哪运行 |
| **文件操作** | `local` / `remote` | read/write/edit 在哪执行 |
| **命令执行** | `local` / `remote` | bash/tests 在哪执行 |

## 预设模式

```typescript
type ExecutionProfile = 
  | 'local-full'      // 高配：全部本地
  | 'remote-full'     // 纯云端：全部远端
  | 'remote-brain-local-hands'  // 低配：远端推理+本地执行
  | 'custom';         // 自定义每个维度
```

## 接口设计

```typescript
interface ExecutionConfig {
  llm: 'local' | 'remote';
  agents: 'local' | 'remote';
  files: 'local' | 'remote';
  commands: 'local' | 'remote';
  
  // 远端连接配置
  remote?: {
    executorUrl: string;
    token?: string;
  };
  
  // 本地工作目录
  localWorkspace: string;
}
```

## HybridToolkitRouter

```typescript
class HybridToolkitRouter implements IToolkitRouter {
  private localRouter: LocalToolkitRouter;
  private remoteRouter: RemoteToolkitRouter;
  private config: ExecutionConfig;

  async execute(toolCall: ToolCall, workspace: string): Promise<ToolResult> {
    const toolName = toolCall.function.name;
    const router = this.resolveRouter(toolName);
    return router.execute(toolCall, workspace);
  }

  private resolveRouter(toolName: string): IToolkitRouter {
    const fileTools = ['read_file', 'write_file', 'edit_file', 'list_directory'];
    const cmdTools = ['bash', 'run_tests', 'run_linter'];
    
    if (fileTools.includes(toolName)) {
      return this.config.files === 'local' ? this.localRouter : this.remoteRouter;
    }
    if (cmdTools.includes(toolName)) {
      return this.config.commands === 'local' ? this.localRouter : this.remoteRouter;
    }
    // 默认远端
    return this.remoteRouter;
  }
}
```

## 关键场景

### 场景1: 低配笔记本创建项目
```
配置: remote-brain-local-hands
- LLM: 远端 DeepSeek API
- Agent: 远端 Python Executor
- 文件: 本地 ./my-project/
- 命令: 本地 (npm install, npm run dev)
```

### 场景2: 高配台式机全本地
```
配置: local-full
- LLM: 本地 Ollama
- Agent: 本地 TS Orchestrator
- 文件: 本地 ./my-project/
- 命令: 本地
```

### 场景3: 远端开发服务器
```
配置: remote-full
- LLM: 远端 API
- Agent: 远端
- 文件: 远端
- 命令: 远端
```
