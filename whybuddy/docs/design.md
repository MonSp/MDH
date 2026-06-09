# 赛博朋克城市地面系统重构设计文档

## 设计目标

本设计文档旨在实现赛博朋克城市地面系统的重构，建立路网优先的生成架构，确保建筑生成时自动避让路网区域，实现代码模块化分离，同时保持现有的视觉效果和性能。

## 模块划分

### 1. 路网数据结构模块（RoadNetworkManager）

**职责**：
- 定义路网数据结构（`RoadNetwork`接口）
- 生成环形路、放射路、十字主干道数据
- 提供路网查询接口

**接口设计**：
```typescript
interface RoadNetwork {
  ringRadii: number[]           // 环形路半径数组
  radialCount: number           // 放射路数量
  roadWidth: number             // 主干道路宽
  ringWidth: number             // 环形路宽
  radialWidth: number           // 放射路宽
  groundSize: number            // 地面尺寸
}

interface RoadSegment {
  position: [number, number, number]
  size: [number, number]
  rotation: number
  type: 'ring' | 'radial' | 'cross'
}
```

**关键函数**：
- `createRoadNetwork(config: RoadNetworkConfig): RoadNetwork`
- `generateRoadSegments(network: RoadNetwork): RoadSegment[]`
- `isOnRoad(x: number, z: number, network: RoadNetwork): boolean`

### 2. 建筑生成模块（BuildingGenerator）

**职责**：
- 基于路网数据生成建筑布局
- 实现建筑避让检测
- 管理建筑实例化渲染

**接口设计**：
```typescript
interface BuildingConfig {
  roadNetwork: RoadNetwork
  nearRings: RingConfig[]
  farRings: RingConfig[]
  safetyMargin: number          // 与路网的安全距离
}

interface BuildingData {
  position: [number, number, number]
  width: number
  depth: number
  height: number  // y,z swapped for Three.js
  neonColor: string
  style: BuildingStyle
  seed: number
  simplified?: boolean
}
```

**关键函数**：
- `generateBuildings(config: BuildingConfig): BuildingData[]`
- `isPositionValid(x: number, z: number, config: BuildingConfig): boolean`
- `calculateBuildingHeight(radius: number, seed: number): number`

### 3. 地面系统模块（GroundSystem）

**职责**：
- 管理地面材质和纹理
- 渲染基础地面、广场、草坪等
- 处理PBR纹理加载

**接口设计**：
```typescript
interface GroundConfig {
  groundSize: number
  plazaRadius: number
  sidewalkWidth: number
}

interface GroundMaterials {
  roadMaterial: THREE.MeshStandardMaterial
  sidewalkMaterial: THREE.MeshStandardMaterial
  baseGroundMaterial: THREE.MeshStandardMaterial
  plazaMaterial: THREE.MeshStandardMaterial
  grassMaterial: THREE.MeshStandardMaterial
  curbMaterial: THREE.MeshStandardMaterial
}
```

**关键函数**：
- `createGroundMaterials(): GroundMaterials`
- `loadPBRTexturesAsync(): Promise<void>`
- `renderGroundSystem(config: GroundConfig): JSX.Element`

### 4. 避让算法设计

**算法原理**：
基于距离检测的避让算法，确保建筑与路网保持安全距离。

**实现步骤**：
1. 计算建筑位置到最近路网段的距离
2. 检查距离是否小于安全距离
3. 如果距离过近，调整建筑位置或跳过该位置

**伪代码**：
```typescript
function isPositionValid(x: number, z: number, config: BuildingConfig): boolean {
  const { roadNetwork, safetyMargin } = config
  
  // 检查是否在环形路上
  for (const radius of roadNetwork.ringRadii) {
    const distToRing = Math.abs(Math.sqrt(x*x + z*z) - radius)
    if (distToRing < safetyMargin) return false
  }
  
  // 检查是否在放射路上
  const angle = Math.atan2(z, x)
  const radialAngleStep = (2 * Math.PI) / roadNetwork.radialCount
  for (let i = 0; i < roadNetwork.radialCount; i++) {
    const radialAngle = i * radialAngleStep
    const angleDiff = Math.abs(angle - radialAngle)
    if (angleDiff < 0.1) { // 0.1弧度约5.7度
      return false
    }
  }
  
  // 检查是否在十字主干道上
  if (Math.abs(x) < safetyMargin || Math.abs(z) < safetyMargin) {
    return false
  }
  
  return true
}
```

## 失败处理策略

### 1. 路网生成失败

**处理策略**：
- 使用默认路网配置
- 记录错误日志
- 降级为简单网格布局

### 2. 建筑生成失败

**处理策略**：
- 跳过当前位置，尝试下一个位置
- 减少建筑数量
- 使用简化建筑模型

### 3. 纹理加载失败

**处理策略**：
- 使用程序化生成的纹理
- 降级为简单材质
- 显示错误提示

## 质量控制

### 1. 性能监控

**监控指标**：
- 帧率（FPS）
- 内存使用
- 渲染调用次数

**优化策略**：
- 保持现有的InstancedMesh优化
- 使用LOD（细节层次）系统
- 纹理复用和压缩

### 2. 视觉质量

**质量标准**：
- 保持赛博朋克视觉风格
- 确保材质和光照效果一致
- 避免视觉瑕疵（如建筑与路网重叠）

### 3. 代码质量

**质量标准**：
- 模块职责清晰
- 接口定义明确
- 错误处理完善
- 文档完整

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    CyberpunkCitySystem                      │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ RoadNetwork  │  │  Building    │  │   Ground     │      │
│  │   Manager    │  │  Generator   │  │   System     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ RoadNetwork  │  │  Building    │  │   Ground     │      │
│  │   Data       │  │    Data      │  │  Materials   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Three.js Scene Graph                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 数据流

```
1. 系统初始化
   ↓
2. 创建路网数据结构（RoadNetworkManager）
   ↓
3. 生成路网段数据（RoadSegment[]）
   ↓
4. 创建建筑配置（BuildingConfig）
   ↓
5. 生成建筑布局（BuildingData[]）
   ↓
6. 渲染地面系统（GroundSystem）
   ↓
7. 渲染路网和建筑
```