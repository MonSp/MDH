# 赛博朋克场景视觉升阶 — 需求规格

## 目标

将 Three.js 赛博朋克城市场景从当前的"光滑几何方块 + 黑暗洞穴"效果，升级为具备"生锈、潮湿、风化"质感的高品质 PBR 视觉效果，同时消除场景过暗导致的"黑暗洞穴"问题，使霓虹光穿透雾气产生漂亮的辉光体积感。

核心策略：**不改变建筑几何结构**，仅通过升级 PBR 纹理通道（normalMap / metalnessMap / roughnessMap）、修正雾光平衡、调优 Bloom 后处理三个维度实现视觉升阶。

## 范围

### 在范围内

1. **建筑 PBR 材质升级**：为 CyberpunkBuildings 组件的 MeshStandardMaterial 新增 normalMap 和 metalnessMap 纹理通道，增强 roughnessMap 对比度
2. **雾色与背景色修正**：将 TowerScene 中的雾色从纯黑 #1a0a2e 改为带蓝灰亮度的 #1a1a2e，同步背景色和体积雾层
3. **建筑 emissive 强度提升**：将建筑主体 emissiveIntensity 从 0.15 提升至 3.0，窗户条带提升至 5.0-8.0
4. **Bloom 后处理参数调优**：将 luminanceThreshold 从 0.1 提升至 0.6，避免整体泛光
5. **性能保障**：确保所有新增纹理使用程序化 Canvas 2D 生成，分辨率不超过 256x256，使用 useMemo 缓存

### 不在范围内

1. 建筑几何结构变更（退台、窗户、装饰细节保持原样）
2. 引入外部纹理文件（PNG/WebP 贴图）
3. 新增 npm 依赖
4. 地面、飞行载具、全息广告牌的材质改动
5. 新增楼顶杂物模型（如管道、天线、水箱）

## 功能要求

### FR1: 建筑 PBR 纹理通道扩展

当 CyberBuilding 组件渲染时，系统应为其 MeshStandardMaterial 同时提供五通道纹理：map（已有 albedo）、roughnessMap（增强版）、normalMap（新增）、metalnessMap（新增）。所有纹理应通过 Canvas 2D 程序化生成，支持 rust/concrete/metal 三种材质类型变体，分辨率 256x256，使用 useMemo 缓存避免重复生成。

### FR2: 法线贴图程序化生成

当系统需要 normalMap 时，应提供 generateNormalMap(seed, type) 函数，使用 Canvas 2D 从 height map 通过 Sobel 算子推导法线向量，输出 RGB 编码的切线空间法线图。rust 类型应突出锈斑凹凸、concrete 类型应突出砖缝和裂缝、metal 类型应突出面板边缘和铆钉凸起。

### FR3: 金属度贴图程序化生成

当系统需要 metalnessMap 时，应提供 generateMetalnessMap(seed, type) 函数。rust 类型：边缘区域高金属度(0.7-0.9)、中心区域低金属度(0.1-0.3)。concrete 类型：全局低金属度(0.05-0.15)。metal 类型：面板区域高金属度(0.8-0.95)。

### FR4: 雾色与背景色修正

当 TowerScene 中雾效启用时，系统应将 fog args 颜色从 #1a0a2e 改为 #1a1a2e（带蓝灰亮度），near=5 保持不变，far 从 80 拉远至 100。背景色（color attach="background"）同步改为 #1a1a2e。5 层体积雾的颜色同步更新。

### FR5: 建筑 emissive 强度分级

当 CyberBuilding 组件渲染时，系统应按以下分级设置 emissiveIntensity：建筑主体 3.0（原 0.15）、窗户条带 5.0-8.0（原 1.5-3.0）、退台结构 2.0（原 0.1）、天台结构 0.5（原 0）。霓虹灯管（NeonLights）保持基线 1.5、脉冲上限从 1.8 提至 3.0。广告牌辉光（HolographicAds）从 0.5 提至 2.0。

### FR6: Bloom 后处理参数调优

当 EffectComposer 渲染场景时，系统应将 Bloom 的 luminanceThreshold 从 0.1 提升至 0.6，intensity 从 1.8 降至 1.2，luminanceSmoothing 从 0.9 降至 0.4。仅亮度超过阈值的元素（霓虹灯、窗户发光条、广告牌）产生辉光。

## 验收标准

### AC1: PBR 纹理验收

当 CyberBuilding 组件渲染时，其 MeshStandardMaterial 应同时绑定 normalMap 和 metalnessMap 纹理。建筑表面在近距观察时应可见锈斑凹凸、砖缝立体感、金属/非金属区域区分。

### AC2: 雾光平衡验收

当场景雾效启用时，远处（50m 以外）建筑轮廓应可辨识，不呈现纯黑背景。建筑的霓虹发光应穿透雾气产生可见辉光，场景整体应有"黄昏城市"氛围而非"黑暗洞穴"。

### AC3: Bloom 效果验收

当场景中存在霓虹灯管和窗户发光条时，Bloom 仅对这些高亮度元素产生辉光效果，建筑主体和地面不应出现整体泛白。

### AC4: 性能验收

当场景包含所有升级后的材质和后处理时，在中端笔记本（GTX 1060 / M1 MacBook）上应保持 ≥30 FPS。程序化纹理应使用 useMemo 缓存，相同 seed 不重复生成。
