# 电影级赛博朋克城市场景升级 — 设计规格

## 设计目标

在不破坏现有主塔楼项目管理交互功能的前提下，将赛博朋克城市背景场景升级至电影级视觉质量。采用渐进式升级策略，新组件独立开发，通过 TowerScene 组装层切换。

## 模块划分

### M1: CyberpunkCityInstanced — InstancedMesh 建筑系统

新建组件 `src/components/cyberpunk/CyberpunkCityInstanced.tsx`，替换现有 CyberpunkBuildings 的背景建筑渲染。

**架构设计：**
- 使用 3 个 InstancedMesh 分别渲染混凝土、金属、玻璃建筑
- 共享 BoxGeometry（宽高深各 1 单位，通过 instanceMatrix 缩放）
- 每栋建筑由两段组成：底部（宽）+ 顶部（窄），模拟退台效果
- 因此共 6 个 InstancedMesh（3 种材质 x 2 段）
- 布局数据通过 `generateCityLayout()` 确定性生成：
  - 8 环同心圆布局（比现有 5 环更密）
  - 每环建筑数量递增，总计 500+ 栋
  - 高度按距离衰减函数 + 随机因子
- 使用 `useEffect` + `Matrix4` 设置每个实例的变换矩阵
- 建筑间距检测避免重叠

**性能优化：**
- frustumCulling 保持默认开启（InstancedMesh 支持）
- 远处建筑使用更小的几何体（LOD by distance）
- 共享材质实例，减少 draw call

### M2: PBRTextureLoader — PBR 纹理加载管线

新建工具 `src/components/cyberpunk/PBRTextureLoader.ts`。

**架构设计：**
- 预定义 3 组贴图路径（混凝土/金属/玻璃），每组含 color/roughness/normal/metalness
- 使用 `THREE.TextureLoader` 异步加载，`useLoader` 或 `useEffect` + `useState`
- 加载失败时 fallback 到 Canvas 程序化纹理（复用现有 `generateProceduralTexture`）
- 贴图文件放入 `public/textures/` 目录（从 ambientCG 下载 1K-JPG zip 解压得到）：
  - `Concrete048_Color.jpg`, `Concrete048_Roughness.jpg`, `Concrete048_NormalGL.jpg`
  - `Metal053C_Color.jpg`, `Metal053C_Roughness.jpg`, `Metal053C_NormalGL.jpg`, `Metal053C_Metalness.jpg`
  - `Facade009_Color.jpg`, `Facade009_Roughness.jpg`, `Facade009_NormalGL.jpg`
- 贴图配置数据结构：
```typescript
interface PBRTextureSet {
  color?: THREE.Texture
  roughness?: THREE.Texture
  normal?: THREE.Texture
  metalness?: THREE.Texture
  ao?: THREE.Texture
}
```

**Fallback 策略：**
1. 尝试加载 PBR 贴图
2. 若文件不存在（404），使用 Canvas 程序化纹理
3. 若 Canvas 也失败，使用纯色 MeshStandardMaterial

### M3: HolographicBillboard — 全息广告牌系统

升级现有 `HolographicAds.tsx` 或新建组件。

**架构设计：**
- Canvas 动态生成 3 类广告牌：
  - 类型 A：中文霓虹文字（"赛博"、"未来"、"数据"等）
  - 类型 B：英文/假名文字（"CYBER"、"NEON"、"データ"等）
  - 类型 C：几何发光图案（圆形、三角形、网格线条）
- 每类生成一张 256x128 CanvasTexture
- 使用 PlaneGeometry + MeshBasicMaterial（emissiveMap = CanvasTexture）
- 位置：建筑外墙侧面，朝向城市中心
- 使用 InstancedMesh 或批量 Sprite 渲染（共用材质）
- 发光强度足够被 Bloom 后处理拾取

### M4: CyberpunkParticles — 多层粒子系统

新建组件 `src/components/cyberpunk/CyberpunkParticles.tsx`。

**架构设计：**
- 3 个独立的 `<Points>` 组件，各使用 BufferGeometry：
  - 低层车流：500 个粒子，y=0.1-0.5，暖黄色 #ffaa44，沿 X/Z 方向流动
  - 中层飞行器：200 个粒子，y=8-25，红/蓝双色，缓慢漂移
  - 高层灰尘：800 个粒子，y=15-50，白色 #ffffff，缓缓飘落
- 粒子纹理：Canvas 绘制的模糊圆点（32x32 radialGradient）
- 动态更新：useFrame 中更新 position BufferAttribute
- 所有粒子复用同一几何体，仅更新 position 属性

### M5: TowerScene 升级 — 相机/雾效/灯光/后处理

修改现有 `TowerScene.tsx`。

**变更点：**
1. **雾效**：`<fog>` 改为 `<fogExp>`（FogExp2），颜色 `#0a0a1a`，密度 0.015-0.025
2. **背景**：`<color attach="background">` 改为深暗紫黑色 `#0a0a1a`
3. **相机**：OrbitControls 初始位置调整为 60-70 度俯视，限制极角范围
4. **阴影**：renderer.shadowMap.type 改为 PCFSoftShadowMap
5. **后处理**：Bloom 参数调整为 threshold=0.1, intensity=1.5, radius=0.4
6. **组件替换**：`<CyberpunkBuildings>` 替换为 `<CyberpunkCityInstanced>`
7. **新增组件**：添加 `<CyberpunkParticles>`

## 失败处理策略

- **PBR 贴图加载失败**：自动 fallback 到 Canvas 程序化纹理，控制台输出警告
- **InstancedMesh 性能不足**：减少远处环的建筑数量（从 500 降到 300）
- **后处理性能不足**：降低 Bloom resolution，或提供关闭后处理的选项
- **浏览器不支持 WebGL2**：降级到基础 MeshStandardMaterial，禁用后处理

## 质量控制

- 每个新组件独立可测试，不依赖其他新组件
- TowerScene 修改保持向后兼容（通过 prop 控制新旧模式切换）
- 所有 Canvas 纹理使用 useMemo 缓存，避免每帧重新生成
- InstancedMesh 的 instanceMatrix 使用 Float32Array，避免 GC 压力
