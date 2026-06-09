# 赛博朋克城市场景迭代升级 — 设计规格

## 设计目标

在现有 Three.js + React Three Fiber 架构上进行最小侵入式升级，通过新增组件和参数调整实现8个维度的视觉提升，同时控制性能开销在60fps可接受范围内。

## 模块划分

### 模块 A：建筑密度与连桥（Phase 1）

**修改文件**：`CyberpunkBuildings.tsx`
**新增文件**：`SkyBridge.tsx`

- `generateBuildings()` 扩展：从3环/55栋 → 5环/220+栋
  - 环1(near): 12栋, radiusMin=8, radiusMax=16
  - 环2: 15栋, radiusMin=16, radiusMax=26
  - 环3: 20栋, radiusMin=26, radiusMax=40
  - 环4(skyline): 15栋, radiusMin=40, radiusMax=58
  - 环5(far): 15栋, radiusMin=58, radiusMax=75
  - 远景简化: 15栋, radius=80-120, simplified=true
- `SkyBridge` 组件：在环1-2建筑间生成发光管道连接
  - 使用 CylinderGeometry 弯曲段 + MeshStandardMaterial emissive
  - 每对相邻建筑间最多1条连桥
  - 仅在环1-2(radius<30)建筑间生成

### 模块 B：故障艺术广告牌（Phase 1）

**修改文件**：`HolographicAds.tsx`
**新增文件**：`GlitchText.tsx`

- `GlitchText` ShaderMaterial 组件：
  - Vertex Shader: 标准正交投影
  - Fragment Shader: 基于 uTime 的 scanline + rgbShift + flicker
  - Uniforms: uTime, uColor, uGlitchIntensity
- `HolographicAds` 升级：
  - 每栋建筑3-4个面覆盖（原2-4个）
  - mega_billboard 使用 GlitchText 替代 Text
  - 新增扫描线动画（水平线从上到下移动）

### 模块 C：立体空中交通（Phase 2）

**修改文件**：`FlyingVehicles.tsx`
**新增文件**：`FreightShip.tsx`, `DroneSwarm.tsx`

- 分层航道：
  - LowLane (8-18): 40个小型飞行汽车
  - MidLane (18-32): 35个飞行汽车+无人机
  - HighLane (32-50): 25个无人机+运输载具
- `FreightShip` 组件：
  - 低多边形 BoxGeometry 组合（船身+引擎+翼面）
  - MeshStandardMaterial + emissive 引擎发光
  - 椭圆轨道，速度0.03-0.06
- `DroneSwarm` 组件：
  - 5-8个无人机编队，共享中心轨道
  - 使用 InstancedMesh 渲染
  - 编队内相对位置固定，整体沿轨道运动

### 模块 D：天气系统增强（Phase 2）

**修改文件**：`CyberRain.tsx`, `TowerScene.tsx`
**新增文件**：`SteamVent.tsx`, `SmokePlume.tsx`

- CyberRain 扩展：count 800 → 3000，分布范围 80 → 120
- `SteamVent` 组件：
  - 位置：广场周围、建筑底部
  - 使用 PointsMaterial 向上喷射白色半透明粒子
  - 周期性喷射（useFrame 控制）
- `SmokePlume` 组件：
  - 位置：建筑间随机分布
  - 使用 SphereGeometry 半透明团块 + 缓慢漂移动画
  - opacity 0.05-0.12，颜色偏灰蓝
- 体积雾层：每层 opacity 使用 `Math.sin(uTime * 0.1 + y)` 动态变化

### 模块 E：地面生活感（Phase 3）

**新增文件**：`PedestrianFlow.tsx`, `VehicleTraffic.tsx`, `StreetVendor.tsx`

- `PedestrianFlow` 组件：
  - 使用 Points + PointsMaterial 沿道路方向流动
  - 4条主干道各100个光点粒子
  - 颜色：暖黄/冷白随机
- `VehicleTraffic` 组件：
  - 使用 Points 沿道路方向流动（速度比行人快）
  - 4条主干道各50个尾灯粒子
  - 颜色：红/白尾灯交替
- `StreetVendor` 组件：
  - 广场区域5-8个摊贩点
  - 每个点：发光 MeshStandardMaterial 小方块 + 蒸汽粒子

### 模块 F：建筑细节保留（Phase 3）

**修改文件**：`BuildingDetails.tsx`

- 当 `simplified=true` 时：
  - 保留天线（AntennaLight）
  - 保留1-2个简化空调外机（scale 缩小50%）
  - 跳过管道/阳台/支架
- 性能影响：每栋远景建筑增加约3个Mesh，15栋共45个，可忽略

### 模块 G：后处理调优（Phase 4）

**修改文件**：`TowerScene.tsx`

- 参数调整（仅改数值，不改结构）：
  - Bloom: luminanceThreshold 0.6→0.3, intensity 1.0→1.8
  - ChromaticAberration: offset (0.003,0.003)→(0.006,0.006)
  - Noise: opacity 0.1→0.15
  - Vignette: darkness 0.4→0.6

### 模块 H：天空穹顶增强（Phase 4）

**修改文件**：`SkyDome.tsx`

- Fragment Shader 新增：
  - `citySilhouette` 函数：基于极坐标生成地平线处黑色锯齿状建筑轮廓
  - `megaStructure` 函数：生成2-3个巨型飞船/平台的黑色剪影
  - 云层密度提升30%，运动速度提升50%

## 失败处理策略

- **性能降级**：若帧率低于45fps，按以下顺序关闭：
  1. SmokePlume（烟尘柱）
  2. CyberRain 降至1500粒子
  3. FlyingVehicles 降至60个
  4. 体积雾层数减半
- **组件加载失败**：每个新增组件使用 React.lazy + Suspense，失败时显示空group
- **Shader编译失败**：GlitchText 和 SkyDome 增强均提供 fallback 纯色材质

## 质量控制

- 每个Phase完成后使用浏览器 Performance 面板测量帧率
- 目标：全景视角60fps，近景视角45fps
- 使用 Three.js `renderer.info.render.calls` 监控 draw call 数量
- 目标：draw call < 500
