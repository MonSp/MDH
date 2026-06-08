# 赛博朋克场景电影级视觉跃迁 — 设计规格

## 设计目标

1. **天空穹顶**：用自定义 ShaderMaterial 替代纯暗背景，提供动态渐变天空和程序化云层，营造图2所示的开阔天空感
2. **大气体积感**：将 5 层简单半透明平面替换为 10+ 层渐变雾，增加近地面烟雾，产生电影级的大气散射和纵深消融效果
3. **电影质感**：通过 Bloom + ChromaticAberration + Noise + Vignette 四重后处理 + ACESFilmic ToneMapping，实现电影画面质感
4. **密度跃迁**：建筑翻倍至 55+、广告增至 30+、载具增至 30，从"稀疏微缩模型"跃迁为"密集赛博都市"
5. **色调重映射**：从暗紫基底转为冷蓝灰电影调色，保持霓虹高光的选择性饱和

## 模块划分

### 模块 1：新建 SkyDome.tsx（天空穹顶）

**文件**：`src/components/cyberpunk/SkyDome.tsx`（新建）

**设计要点**：

1. 使用 `THREE.SphereGeometry(200, 32, 32)` 作为穹顶几何体
2. 自定义 `THREE.ShaderMaterial`：
   - Vertex Shader：将顶点位置传递给 Fragment，计算视图方向
   - Fragment Shader：
     - 基于 y 分量做三段渐变插值（顶部→中部→地平线）
     - 顶部色 `#0a0a2e`，中部色 `#1a1a3a`，地平线色 `#3a2020`
     - 使用 Simplex Noise 函数生成云层 alpha，叠加在 y > 0.3 的区域
     - 云层颜色为半透明白色 `rgba(1,1,1, cloudAlpha * 0.3)`
3. 双面渲染（`side: THREE.BackSide`），不写入深度（`depthWrite: false`）
4. 添加微弱的 `time` uniform 驱动云层漂移动画（`offset += time * 0.001`）
5. 渲染顺序 `renderOrder: -1000`，确保在最远层

**接口**：
```tsx
// props
{ mode?: 'dusk' | 'night' } // 环境模式，默认 'dusk'
```

### 模块 2：重写 TowerScene.tsx 体积雾

**文件**：`src/components/techtower/TowerScene.tsx`

**改造要点**：

1. 将现有的 5 层雾平面循环替换为 12 层渐变雾平面
2. 高度分布：y = 1, 2, 3, 5, 8, 12, 16, 20, 25, 30, 35, 40
3. Opacity 计算公式：`opacity = 0.2 * Math.exp(-0.08 * (y - 1))`（指数衰减）
4. 近地面 2 层（y=1, 2）颜色改为暖灰 `#3a3a4a`（模拟烟尘）
5. 其余层颜色统一为 `#2a2a4e`
6. 每层尺寸递增：`size = 80 + y * 3`（越高越宽，模拟大气散射扩散）
7. 保留雾的开关切片功能（fogToggle）

**雾层配置表**：

| y | opacity | color | size | 说明 |
|---|---------|-------|------|------|
| 1 | 0.20 | #3a3a4a | 83 | 近地面烟尘 |
| 2 | 0.16 | #3a3a4a | 86 | 近地面烟尘 |
| 3 | 0.14 | #2a2a4e | 89 | 低空过渡 |
| 5 | 0.11 | #2a2a4e | 95 | 中低空 |
| 8 | 0.09 | #2a2a4e | 104 | 中空 |
| 12 | 0.07 | #2a2a4e | 116 | 中高空 |
| 16 | 0.05 | #2a2a4e | 128 | 高空 |
| 20 | 0.04 | #2a2a4e | 140 | 高空 |
| 25 | 0.03 | #2a2a4e | 155 | 远空 |
| 30 | 0.02 | #2a2a4e | 170 | 远空 |
| 35 | 0.01 | #2a2a4e | 185 | 极远 |
| 40 | 0.01 | #2a2a4e | 200 | 极远 |

### 模块 3：扩展 EffectComposer 后处理

**文件**：`src/components/techtower/TowerScene.tsx`

**改造要点**：

在现有 `<EffectComposer>` 中添加：
```tsx
import { ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

<EffectComposer>
  <Bloom
    luminanceThreshold={0.6}
    luminanceSmoothing={0.4}
    intensity={1.0}
  />
  <ChromaticAberration
    offset={[0.003, 0.003]}
    radialModulation={true}
    modulationOffset={0.5}
  />
  <Noise
    premultiply
    blendFunction={BlendFunction.ADD}
    opacity={0.1}
  />
  <Vignette
    offset={0.3}
    darkness={0.4}
  />
</EffectComposer>
```

同时设置 Canvas 属性：
```tsx
<Canvas gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}>
```

### 模块 4：扩展 CyberpunkBuildings.tsx

**文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`

**改造要点**：

1. 修改 `generateBuildings()` 函数的环数和数量参数：
```typescript
const BUILDING_CONFIG = {
  nearRings: [
    { count: 8,  minRadius: 18, maxRadius: 28, minH: 12, maxH: 32, minW: 3, maxW: 8 },
    { count: 12, minRadius: 28, maxRadius: 42, minH: 10, maxH: 38, minW: 3, maxW: 9 },
    { count: 15, minRadius: 42, maxRadius: 58, minH: 8,  maxH: 35, minW: 4, maxW: 10 },
  ],
  skylineLayers: [
    { count: 10, minRadius: 45, maxRadius: 65, minH: 40, maxH: 60, minW: 5, maxW: 12 },
    { count: 10, minRadius: 55, maxRadius: 75, minH: 60, maxH: 80, minW: 6, maxW: 14 },
  ],
  farBuildings: [
    { count: 12, minRadius: 80, maxRadius: 120, minH: 20, maxH: 40, minW: 4, maxW: 8, simplified: true },
  ],
}
```

2. 新增 `simplified` 标志：当 `simplified=true` 时，建筑仅生成主体立方体+窗户条带，跳过退台/天线/装饰细节生成逻辑
3. 总建筑数：35 近 + 20 天际线 + 12 超远 = 67 栋

### 模块 5：扩展 HolographicAds.tsx

**文件**：`src/components/cyberpunk/HolographicAds.tsx`

**改造要点**：

1. 将每栋建筑的广告分配逻辑从 `Math.random() < 0.5 ? 0 : random(1,2)` 改为 `random(2,4)`
2. 新增广告类型 `mega_billboard`：宽高比 2:3，覆盖 3-5 层楼高度（h=10~17.5 单位），emissiveIntensity=5.0
3. 新增广告类型 `neon_strip`：窄长条形（w=1.5, h=0.8），密集排列在低楼层，每栋建筑 3-5 个
4. 广告文字词库扩展至 30+ 条（新增：量子通讯, 赛博空间, 数据核心, 神经网络, 全息投影, 虚拟现实, 量子计算, 人工智能, 数字孪生, 元宇宙, 信息洪流, 深度学习, 边缘计算, 脑机接口, 纳米科技, 仿生义体, 合成意识, 数字永生, 基因编辑, 超级智能）
5. 基础广告 emissiveIntensity 从 0.5-2.0 提升至 3.0-4.0

### 模块 6：扩展 FlyingVehicles.tsx

**文件**：`src/components/cyberpunk/FlyingVehicles.tsx`

**改造要点**：

1. 将载具总数从 15 增至 30：`{ cars: 18, drones: 12 }`
2. 轨道半径范围：`{ min: 10, max: 60 }`（从 15-50 扩大）
3. 高度范围：`{ min: 8, max: 50 }`（从 12-37 扩大）
4. 新增载具类型 `transport`（大型运输飞船）：
   - 比例：`scale={2.5}`
   - 速度：`speed * 0.4`（缓慢移动）
   - 拖尾：3 条平行 Trail（间距 1.5 单位）
   - 外观：更宽的矩形主体 + 多个引擎发光点
   - 占比：3 架运输飞船 + 15 架普通汽车 + 12 架无人机 = 30 架

### 模块 7：全局色调调整

**文件**：
- `src/components/techtower/TowerScene.tsx`：雾色、背景色
- `src/components/cyberpunk/CyberpunkGround.tsx`：地面反射色
- `src/components/cyberpunk/NeonLights.tsx`：霓虹灯管基线参数
- `src/components/cyberpunk/CyberpunkBuildings.tsx`：建筑 emissive 颜色微调

**改造要点**：

1. TowerScene.tsx 雾色/背景色：`#1a1a2e` → `#1a1a3a`
2. 体积雾层颜色：统一调整为 `#2a2a4e`
3. CyberpunkGround.tsx 地面 color：`#151528` → `#181830`
4. CyberpunkLights.tsx 环境光从 `#2a1a3a` 调整为 `#1a1a3a`（减少紫色，增加蓝色）
5. 半球光天空色从 `#6b4a8a` 调整为 `#4a5a8a`（蓝灰替代紫）

## 失败处理策略

### 策略1：ChromaticAberration 性能影响

若 ChromaticAberration 导致帧率下降超过 5 FPS，降级方案为将 `offset` 从 `[0.003, 0.003]` 降至 `[0.001, 0.001]`，或仅在摄像机运动时启用（通过 `enabled` prop 动态切换）。

### 策略2：67 栋建筑导致帧率低于 30

若建筑总数导致帧率不达标，降级方案为：
- 首先将超远建筑层从 12 栋降至 6 栋
- 然后将近处外环从 15 栋降至 10 栋
- 最后对远处建筑启用 InstancedMesh 合批

### 策略3：ShaderMaterial 天空不兼容

若自定义 ShaderMaterial 在某些设备上出现渲染异常，降级方案为使用 drei 的 `GradientTexture` 叠加在 `Sphere` 上，或使用 `Sky` 组件作为替代。

### 策略4：广告数量过多导致 overdraw

若 30+ 个广告牌导致过度绘制(overdraw)，降级方案为对距离摄像机 >60 单位的广告禁用渲染（通过 frustum culling 或手动距离检测）。

## 质量控制

1. TypeScript 类型检查通过（`npm run typecheck` 或 Vite 编译检查）
2. 所有新增组件使用 `React.memo` 或 `useMemo` 缓存几何/材质
3. 天空 Shader 不使用外部纹理文件，纯程序化生成
4. 体积雾平面使用 `transparent: true` + `depthWrite: false` 避免深度冲突
5. 新增后处理效果的性能影响可通过 UI 开关控制
6. 视觉验证清单：
   - 仰视可见渐变天空+云层
   - 远处建筑自然消融于雾中
   - 画面边缘有暗角，快速移动有轻微色散
   - 背景建筑密度感显著提升
   - 全息广告密集覆盖建筑立面
   - 整体色调为冷蓝灰，霓虹保持饱和
