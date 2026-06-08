# 赛博朋克场景建筑逼真度与材质系统全栈升级 — 设计规格

## 设计目标

1. **建筑几何升级**：用 ExtrudeGeometry 替代 BoxGeometry，通过 THREE.Shape 定义带凹凸/退台/女儿墙的建筑俯视轮廓，拉伸生成 3D 几何体，实现从"方块"到"建筑"的视觉跃迁
2. **窗户系统重建**：用 InstancedMesh 替代 PlaneGeometry 条带，每栋建筑渲染约 200 个独立窗户实例（总计约 1 万个），支持 emissive 发光和随机点亮
3. **材质系统升级**：用 MeshPhysicalMaterial 替代 MeshStandardMaterial，为三种建筑风格定义独立的 clearcoat/metalness/roughness/envMap 参数集
4. **风格多样性**：定义现代玻璃幕墙/老式砖楼/工业风建筑三种风格，每种有独立的几何轮廓和材质参数
5. **高度分布真实化**：使用距离衰减函数控制建筑高度，中心高边缘低，模拟真实城市天际线
6. **全栈整合**：确保建筑系统升级与现有 SkyDome/体积雾/后处理/密度系统兼容

## 模块划分

### 模块 1：BuildingProfileGenerator — ExtrudeGeometry 建筑轮廓生成器

**文件**：`src/components/cyberpunk/BuildingProfileGenerator.ts`（新建）

**设计要点**：

1. 导出 `generateBuildingProfile(style, width, depth, seed)` 函数，返回 `THREE.ExtrudeGeometry`
2. 使用 `THREE.Shape` 定义建筑俯视轮廓：
   - **glass 风格**：矩形轮廓，可选的短边凹入（模拟入口大厅）
   - **brick 风格**：窄矩形 + 侧面阶梯退台（每 3 层收窄 0.3 单位）
   - **industrial 风格**：L形轮廓（主体 + 翼楼）
3. 使用 `THREE.ExtrudeGeometry` 拉伸，参数：
   - `steps: 1`（单段拉伸）
   - `depth: height`（拉伸高度）
   - `bevelEnabled: false`（无倒角，保持硬边建筑感）
4. 分段退台实现：对每种风格生成 2-3 段 ExtrudeGeometry，按高度堆叠（底层宽→中层窄→顶层更窄），合并为单个 BufferGeometry
5. 轮廓点数控制在 30-50 个

**接口**：
```typescript
type BuildingStyle = 'glass' | 'brick' | 'industrial'

interface BuildingProfileParams {
  style: BuildingStyle
  width: number
  depth: number
  height: number
  seed: number
}

function generateBuildingProfile(params: BuildingProfileParams): THREE.ExtrudeGeometry
```

### 模块 2：BuildingDetails — 建筑细节附件系统

**文件**：`src/components/cyberpunk/BuildingDetails.tsx`（新建）

**设计要点**：

1. 为每栋非简化建筑生成细节附件，使用 `THREE.Group` 挂载
2. 附件类型：
   - **空调外机**：`BoxGeometry(0.5, 0.3, 0.4)`，放置在立面中上部，每栋 3-6 个
   - **管道**：`CylinderGeometry(0.05, 0.15, height*0.6)`，放置在建筑侧面，每栋 1-3 根
   - **阳台**：`BoxGeometry(1.5, 0.1, 0.8)`，悬挑在立面，每栋 2-4 个
   - **广告牌支架**：L形金属架（两个 BoxGeometry 组合），放置在低楼层，每栋 1-2 个
3. 通过 seed 确定性放置，使用伪随机函数选择位置和数量
4. 材质：`MeshStandardMaterial({ color: '#252535', roughness: 0.7, metalness: 0.3 })`
5. 远景建筑（simplified=true）跳过细节生成

**接口**：
```tsx
interface BuildingDetailsProps {
  width: number
  depth: number
  height: number
  seed: number
  style: BuildingStyle
  simplified?: boolean
}

function BuildingDetails({ width, depth, height, seed, style, simplified }: BuildingDetailsProps): JSX.Element
```

### 模块 3：BuildingWindows — InstancedMesh 窗户渲染器

**文件**：`src/components/cyberpunk/BuildingWindows.tsx`（新建）

**设计要点**：

1. 使用 `THREE.InstancedMesh` 渲染窗户，共享几何体 `PlaneGeometry(0.6, 0.4)`
2. 窗户布局：每栋建筑在 4 个立面上按网格放置
   - 行间距：2.5 单位（层高）
   - 列间距：1.2 单位
   - 每面约 50 个窗户，4 面共约 200 个
3. 使用 `setMatrixAt()` 设置每个实例的变换矩阵（位置 + 旋转，使窗户朝向建筑外侧）
4. 窗户材质参数：
   - `emissive: #ffaa44`（暖黄）或 `#4488ff`（冷蓝）
   - `emissiveIntensity: 0.8-1.5`
   - `toneMapped: false`（在 Bloom 中产生 HDR 辉光）
5. 通过 `setColorAt()` 为每个实例设置独立颜色
6. 点亮逻辑：seed 随机决定 60% 窗户点亮，40% 全黑（emissive=0x000000）
7. 脉冲动画：已点亮窗户的 emissiveIntensity 在 `useFrame` 中做微弱脉冲（±0.2，频率 0.5Hz）
8. 远景建筑窗户数降至 50 个（LOD 优化）

**接口**：
```tsx
interface BuildingWindowsProps {
  width: number
  depth: number
  height: number
  seed: number
  style: BuildingStyle
  simplified?: boolean
}

function BuildingWindows({ width, depth, height, seed, style, simplified }: BuildingWindowsProps): JSX.Element
```

### 模块 4：材质参数系统 — MeshPhysicalMaterial 风格化材质

**文件**：`src/components/cyberpunk/BuildingMaterials.ts`（新建）

**设计要点**：

1. 定义三种建筑风格的 MeshPhysicalMaterial 参数集：

```typescript
const BUILDING_MATERIALS: Record<BuildingStyle, Partial<THREE.MeshPhysicalMaterialParameters>> = {
  glass: {
    color: '#4a6a8a',
    metalness: 0.9,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    envMapIntensity: 2.0,
  },
  brick: {
    color: '#6a4a3a',
    metalness: 0.0,
    roughness: 0.85,
    clearcoat: 0.0,
    envMapIntensity: 0.5,
  },
  industrial: {
    color: '#3a3a4a',
    metalness: 0.6,
    roughness: 0.3,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.2,
  },
}
```

2. 材质使用现有 Environment HDR（`dikhololo_night_1k.hdr`）作为环境反射源
3. 每栋建筑的程序化纹理（diffuseMap/roughnessMap/normalMap/metalnessMap）保留，作为 MeshPhysicalMaterial 的 map 参数
4. 导出 `createBuildingMaterial(style, seed)` 工厂函数

### 模块 5：重写 CyberpunkBuildings.tsx 主组件

**文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`（重写）

**改造要点**：

1. `generateBuildings()` 函数改造：
   - 新增 `style` 字段（`'glass' | 'brick' | 'industrial'`），由 seed 确定性分配（40%/30%/30%）
   - 高度分布改为距离衰减函数：`height = 10 + 70 * (1 - clamp(r/80, 0, 1)^1.5) + random(-20%, +20%)`
   - 保持 3 环+2 天际线+1 远景的环形分布结构
   - 总建筑数保持 55+

2. `CyberBuilding` 组件重写：
   - 主体几何从 `BoxGeometry` 改为 `ExtrudeGeometry`（调用 BuildingProfileGenerator）
   - 材质从 `MeshStandardMaterial` 改为 `MeshPhysicalMaterial`（调用 BuildingMaterials）
   - 窗户从 `PlaneGeometry` 条带改为 `InstancedMesh`（调用 BuildingWindows）
   - 建筑细节从内联 JSX 改为独立组件（调用 BuildingDetails）
   - 保留霓虹边框（LineSegments）和天线系统

3. 保持现有接口兼容：
   - `buildings` prop 类型不变（`BuildingData[]`）
   - `BuildingData` 新增可选 `style` 字段
   - `generateBuildings()` 返回值兼容

### 模块 6：高度分布算法

**文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`（集成）

**设计要点**：

1. 修改 `generateBuildings()` 中的高度生成逻辑
2. 距离衰减函数：
```typescript
function getBuildingHeight(radius: number, seed: number): number {
  const baseHeight = 10
  const maxExtraHeight = 70
  const falloffRadius = 80
  const power = 1.5
  const normalizedDist = Math.min(radius / falloffRadius, 1)
  const heightFactor = Math.pow(1 - normalizedDist, power)
  const randomFactor = 0.8 + pseudoRandom(seed) * 0.4 // ±20% 波动
  return baseHeight + maxExtraHeight * heightFactor * randomFactor
}
```

3. 中心区域（r<25）：40-80 单位
4. 中间区域（r25-50）：20-45 单位
5. 边缘区域（r>50）：10-25 单位

### 模块 7：大气系统兼容性整合

**文件**：`src/components/techtower/TowerScene.tsx`

**设计要点**：

1. 确认 SkyDome、体积雾、后处理管线与新建筑材质系统兼容
2. MeshPhysicalMaterial 的 clearcoat 需要 Environment HDR 反射 → 确认 `<Environment files="/dikhololo_night_1k.hdr" />` 已设置
3. Bloom 后处理需正确响应 emissive 窗户的 HDR 辉光 → 确认 `toneMapped=false` 在窗户材质上设置
4. 无需修改 TowerScene.tsx 的核心逻辑，仅确认兼容性

## 失败处理策略

### 策略1：ExtrudeGeometry 性能影响

若 ExtrudeGeometry 导致帧率下降超过 5 FPS，降级方案为：对距离 >40 的建筑保留 BoxGeometry（已有 LOD 标志 simplified），仅对近处 20 栋建筑使用 ExtrudeGeometry。

### 策略2：InstancedMesh 窗户数量过多

若 11,000 个窗户实例导致帧率低于 30，降级方案为：将每栋窗户数从 200 降至 100（总计 5,500），或对远处建筑禁用窗户动画。

### 策略3：MeshPhysicalMaterial clearcoat 不兼容

若某些设备不支持 clearcoat（WebGL 1.0），降级方案为：检测 `renderer.capabilities.isWebGL2`，不支持时自动将 clearcoat 设为 0 并使用标准反射。

### 策略4：三种风格建筑轮廓过于相似

若三种风格的 ExtrudeGeometry 轮廓在远处不可辨识，降级方案为：增大风格间的颜色差异（glass 偏蓝、brick 偏红、industrial 偏灰），通过颜色而非几何区分风格。

## 质量控制

1. TypeScript 类型检查通过
2. 所有新增组件使用 `React.memo` 或 `useMemo` 缓存几何/材质
3. InstancedMesh 使用共享 BufferGeometry + 共享材质，单栋建筑仅 1 次 draw call
4. ExtrudeGeometry 轮廓点数 ≤ 50/栋
5. 远景建筑（simplified=true）使用 BoxGeometry + 50 个窗户实例
6. 视觉验证清单：
   - 建筑有可辨识的凹凸轮廓（非纯方块）
   - 窗户为独立实例（非条带），可发光
   - 玻璃幕墙有 clearcoat 反射，砖楼有粗糙质感
   - 三种风格视觉可区分
   - 中心建筑高于边缘
   - 中端设备帧率 ≥30 FPS
