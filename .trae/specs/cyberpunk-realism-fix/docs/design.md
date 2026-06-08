# 赛博朋克世界真实感提升 — 设计规格

## 设计目标

在不改变现有组件结构和场景布局的前提下，通过材质参数调优、光源补全、后处理集成三个层面修复赛博朋克场景的光照/材质缺陷。设计遵循最小改动原则：只修改必要的参数和添加必要的组件，不重构现有代码架构。

## 模块划分

### M1 CyberpunkGround材质参数调整
**改动文件**：`src/components/cyberpunk/CyberpunkGround.tsx`

将6种材质的emissiveIntensity和color进行提亮：
- `baseGroundMaterial`：emissiveIntensity 0.2→0.5, color #1e1e35→#2a2a4a, emissive #0a0a20→#151530
- `roadMaterial`：emissiveIntensity 0.15→0.4, color #1a1a30→#252540, emissive #0a0a1a→#121225
- `sidewalkMaterial`：emissiveIntensity 0.3→0.5, color #4a4a6a→#5a5a7a
- `grassMaterial`：emissiveIntensity 0.6→0.8, emissive #0d3520→#104028
- `plazaMaterial`：emissiveIntensity 0.5→0.7
- `neonLineMaterial`：emissiveIntensity 2.5→3.0（已有足够亮度，微调）

### M2 NeonTube伴随点光源
**改动文件**：`src/components/cyberpunk/NeonLights.tsx`

在NeonTube组件中添加pointLight：
- 使用`useMemo`缓存`curve.getPoint(0.5)`获取曲线中点作为光源位置
- pointLight属性：color=灯管颜色, distance=6, intensity=0.8, decay=2
- 放置在曲线中点，与灯管同步渲染

### M3 GlassCurtainWall emissive改造
**改动文件**：`src/components/techtower/BuildingScene.tsx`

为窗户玻璃材质添加发光效果：
- glassMat添加`emissive="#1a2a4a"`和`emissiveIntensity=0.4`
- 在useEffect中利用已有的楼层循环，为每个实例设置不同的emissive颜色
- 使用instanceColor已有的楼层渐变色系（#ff9f0a/#ff375f/#bf5af2）作为emissive参考

### M4 EffectComposer+Bloom后处理
**改动文件**：`src/components/techtower/TowerScene.tsx`

引入轻量后处理管线：
- 使用`@react-three/postprocessing`库的`EffectComposer`和`Bloom`组件
- Bloom参数：luminanceThreshold=0.2, luminanceSmoothing=0.9, intensity=0.8
- 包裹在TowerScene的现有JSX内容外围
- 需要在Canvas的gl配置中确保toneMapping正确开启

### M5 建筑材质调优 + Environment
**改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`, `src/components/techtower/TowerScene.tsx`

修复建筑金属材质的纯黑问题：
- CyberBuilding的meshPhysicalMaterial：metalness 0.9→0.6, roughness 0.05→0.2, 添加envMapIntensity=0.8
- color从neonColor改为深色调`#1a1a30`，让neonColor只用于emissive和边线
- TowerScene中添加`<Environment preset="night" />`为金属表面提供反射环境

## 失败处理策略

### 材质参数调优失败
如果提亮后的材质导致过曝或视觉异常，回退到中间值并逐步调整。保留原始参数作为注释便于回退。

### Bloom后处理性能问题
如果EffectComposer+Bloom导致帧率下降超过30%，降低Bloom的resolution（从默认1024降到512），或降低intensity到0.5。

### Environment组件兼容性
如果`<Environment preset="night" />`与现有场景冲突（如改变背景色），使用`<Environment background={false} />`仅提供反射不改变背景。

### NeonTube点光源过多
如果16根灯管的16个pointLight导致性能问题，改为只在主要灯管（L型和竖向）上添加pointLight，地面装饰线不添加。

## 质量控制

- 每个模块改动后需在浏览器中验证视觉效果
- 使用Chrome DevTools的Performance面板监控帧率变化
- Bloom后处理需要在低端设备上测试（目标：保持30fps以上）
- 所有材质参数改动需要保留原始值作为注释，便于A/B对比
