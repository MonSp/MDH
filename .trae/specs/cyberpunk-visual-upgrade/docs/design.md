# 赛博朋克场景视觉升阶 — 设计规格

## 设计目标

1. **PBR 完整性**：为建筑材质补齐 normalMap 和 metalnessMap 两个缺失的 PBR 纹理通道，使 Three.js 的物理渲染管线完整运作
2. **雾光平衡**：通过调整雾色亮度和 emissive 强度的配合，消除"黑暗洞穴"并实现"霓虹穿透雾"的赛博朋克氛围
3. **精准辉光**：通过提高 Bloom 阈值，仅让高亮度元素（霓虹灯、窗户、广告牌）产生辉光，避免整体泛白
4. **零资产依赖**：所有纹理通过 Canvas 2D 程序化生成，不引入外部纹理文件，保持部署简洁

## 模块划分

### 改造模块 1：src/components/cyberpunk/CyberpunkBuildings.tsx

**改造内容**：新增 generateNormalMap 和 generateMetalnessMap 程序化纹理生成函数；增强现有 generateProceduralTexture 的 roughnessMap 对比度；升级 CyberBuilding 组件的材质绑定和 emissive 参数。

**改造要点**：

#### 1a. 新增 generateNormalMap(seed, type) 函数

在现有 `generateProceduralTexture` 函数之后新增。实现逻辑：

1. 创建 256x256 Canvas
2. 先生成灰度 height map（复用现有纹理生成逻辑的亮度信息）
3. 对 height map 执行 Sobel 卷积：
   - 水平梯度 Gx = height[x+1,y] - height[x-1,y]
   - 垂直梯度 Gy = height[x,y+1] - height[x,y-1]
4. 法线向量 = normalize(-Gx, -Gy, 1.0)
5. 编码为 RGB：R = nx * 0.5 + 0.5, G = ny * 0.5 + 0.5, B = nz * 0.5 + 0.5
6. 三种类型差异化：
   - rust：大幅梯度（锈斑凹凸明显）
   - concrete：中等梯度（砖缝为主）
   - metal：锐利边缘梯度（面板线条）

#### 1b. 新增 generateMetalnessMap(seed, type) 函数

实现逻辑：

1. 创建 256x256 Canvas，黑色基底（全零金属度）
2. 按类型填充：
   - rust：随机散布高金属度斑块（锈蚀暴露底层金属），边缘区域更亮
   - concrete：几乎全黑，仅在钢筋露出点有微弱亮度
   - metal：面板区域填充高亮度(200-245)，接缝处为黑色(0-20)
3. 随机噪点添加微观变化

#### 1c. 增强 roughnessMap 对比度

在现有 `generateProceduralTexture` 函数中，当 type 参数用于 roughnessMap 时（通过独立的 seed 区分）：
- 锈蚀区域：roughness 值 200-255（白色，高粗糙）
- 金属光滑区域：roughness 值 50-100（深灰，低粗糙）
- 污渍/水痕：添加 150-180 的中灰区域

#### 1d. CyberBuilding 材质绑定升级

在 CyberBuilding 组件的 meshStandardMaterial JSX 中新增：
```
normalMap={normalMap}
normalScale={new THREE.Vector2(0.8, 0.8)}
metalnessMap={metalnessMap}
```

同时调整 emissive 参数（见模块 3）。

### 改造模块 2：src/components/techtower/TowerScene.tsx

**改造内容**：修改雾色、背景色、体积雾层颜色、Bloom 参数。

**改造要点**：

#### 2a. 雾色修正

```typescript
// 从
<fog attach="fog" args={['#1a0a2e', 5, 80]} />
// 改为
<fog attach="fog" args={['#1a1a2e', 5, 100]} />
```

#### 2b. 背景色同步

```typescript
// 从
<color attach="background" args={['#1a0a2e']} />
// 改为
<color attach="background" args={['#1a1a2e']} />
```

#### 2c. 体积雾层颜色同步

将 5 层体积雾的 color 从 `#1a0a2e` 改为 `#1a1a2e`。

#### 2d. Bloom 参数调整

```typescript
// 从
<Bloom luminanceThreshold={0.1} luminanceSmoothing={0.9} intensity={1.8} />
// 改为
<Bloom luminanceThreshold={0.6} luminanceSmoothing={0.4} intensity={1.2} />
```

### 改造模块 3：src/components/cyberpunk/CyberpunkBuildings.tsx（emissive 部分）

**改造内容**：分级调整 emissiveIntensity。

**改造要点**：

| 元素 | 当前值 | 目标值 |
|------|--------|--------|
| 建筑主体 (line ~210) | 0.15 | 3.0 |
| 退台结构 (line ~225) | 0.1 | 2.0 |
| 天台结构 (line ~233) | 0 | 0.5 (新增 emissive) |
| 窗户条带 (line ~248-279) | 1.5-3.0 | 5.0-8.0 |
| 天线信号灯 (line ~379) | 0.8 | 2.0 |

### 改造模块 4：src/components/cyberpunk/NeonLights.tsx

**改造内容**：提升霓虹灯管脉冲上限。

**改造要点**：
- NeonTube 基线 emissiveIntensity 从 1.5 提升至 2.0
- useFrame 中脉冲范围从 `1.2 + sin * 0.6`（范围 0.6-1.8）改为 `2.0 + sin * 1.0`（范围 1.0-3.0）

### 改造模块 5：src/components/cyberpunk/HolographicAds.tsx

**改造内容**：提升广告牌辉光强度。

**改造要点**：
- 辉光背景板 emissiveIntensity 从 0.5 提升至 2.0
- useFrame 脉冲范围从 `0.5 + sin * 0.3` 改为 `2.0 + sin * 0.5`

### 依赖关系

```
CyberpunkBuildings.tsx
├── generateProceduralTexture() — 已有，增强 roughnessMap
├── generateNormalMap() — 新增
├── generateMetalnessMap() — 新增
└── CyberBuilding 组件 — 材质绑定 + emissive 参数升级

TowerScene.tsx
├── fog / background — 颜色修正
├── 体积雾层 — 颜色同步
└── Bloom — 参数调整

NeonLights.tsx — emissive 脉冲范围提升
HolographicAds.tsx — 辉光强度提升
```

## 失败处理策略

### 策略1：程序化法线贴图视觉效果不理想

若 Sobel 推导的法线贴图效果不如预期，降级方案为：直接复用 roughnessMap 作为 height map，将其对比度放大 2 倍后作为 normalMap 输入，不执行 Sobel 卷积。视觉上仍有凹凸感，但精度降低。

### 策略2：高 emissive 值导致过曝

若 emissiveIntensity=3.0 在某些设备上导致过曝，通过 `renderer.toneMapping = THREE.ACESFilmicToneMapping` 和 `renderer.toneMappingExposure = 0.8` 自动压制高光。当前场景已使用 EffectComposer，ACES 色调映射会自然限制亮度峰值。

### 策略3：新增纹理导致性能下降

若新增 normalMap 和 metalnessMap 后帧率低于 30 FPS，降级方案为：仅在最靠近摄像机的 5 栋建筑上使用完整 PBR 纹理，远处建筑仅保留 albedo + roughness。通过距离检测动态切换材质 LOD。

## 质量控制

1. 前端 TypeScript 类型检查通过（`npm run typecheck` 或等效命令）
2. 所有新增函数使用 useMemo 缓存，确保相同 seed 不重复生成纹理
3. 程序化纹理分辨率统一为 256x256（不超过 512x512 的性能约束）
4. 新增的 normalMap/metalnessMap 函数需有 JSDoc 注释说明参数含义和输出格式
5. 视觉验证：改造后场景应在浏览器中可见以下效果
   - 建筑墙面有锈斑凹凸感（normalMap 效果）
   - 金属管道/面板与混凝土墙面有明显金属度差异
   - 远处建筑轮廓在雾中可辨识
   - 霓虹光穿透雾产生辉光
