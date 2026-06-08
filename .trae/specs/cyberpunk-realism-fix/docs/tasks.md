# 赛博朋克世界真实感提升 — 任务清单

## 里程碑

### M1 材质参数调优（优先级最高，改动最小）
完成地面材质和建筑材质的参数调整，立即改善场景可见度。

### M2 光源补全
完成NeonTube伴随pointLight和GlassCurtainWall emissive改造，让场景中的光源自发照亮周围。

### M3 后处理管线
完成EffectComposer+Bloom集成和Environment组件添加，实现最终的辉光效果和环境反射。

## 任务清单

### T1 修改CyberpunkGround材质参数
- **优先级**：P0（最高）
- **改动文件**：`src/components/cyberpunk/CyberpunkGround.tsx`
- **具体改动**：
  - baseGroundMaterial: emissiveIntensity 0.2→0.5, color #1e1e35→#2a2a4a, emissive #0a0a20→#151530
  - roadMaterial: emissiveIntensity 0.15→0.4, color #1a1a30→#252540, emissive #0a0a1a→#121225
  - sidewalkMaterial: emissiveIntensity 0.3→0.5, color #4a4a6a→#5a5a7a
  - grassMaterial: emissiveIntensity 0.6→0.8, emissive #0d3520→#104028
  - plazaMaterial: emissiveIntensity 0.5→0.7
  - neonLineMaterial: emissiveIntensity 2.5→3.0
- **验证**：CyberpunkGround.tsx中6种材质的emissiveIntensity均≥0.4，color提亮至少20%

### T2 调整建筑材质并添加Environment
- **优先级**：P0
- **改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`, `src/components/techtower/TowerScene.tsx`
- **具体改动**：
  - CyberBuilding meshPhysicalMaterial: metalness 0.9→0.6, roughness 0.05→0.2, 添加envMapIntensity=0.8
  - color从neonColor改为#1a1a30，neonColor只用于emissive和边线
  - TowerScene添加`<Environment preset="night" background={false} />`
- **验证**：建筑表面在默认视角下不呈现纯黑色，能看到环境反射

### T3 为NeonTube添加伴随pointLight
- **优先级**：P1
- **改动文件**：`src/components/cyberpunk/NeonLights.tsx`
- **具体改动**：
  - 在NeonTube组件中添加useMemo缓存curve.getPoint(0.5)
  - 添加pointLight：position=曲线中点, color=灯管颜色, distance=6, intensity=0.8, decay=2
- **验证**：NeonTube组件内新增pointLight元素，灯管附近物体被照亮

### T4 改造GlassCurtainWall材质
- **优先级**：P1
- **改动文件**：`src/components/techtower/BuildingScene.tsx`
- **具体改动**：
  - glassMat添加emissive="#1a2a4a"和emissiveIntensity=0.4
  - 在useEffect的楼层循环中，利用已有的getFloorGradientColor设置不同楼层的emissive色
- **验证**：窗户在暗场景中可见发光效果

### T5 集成Bloom后处理
- **优先级**：P2
- **改动文件**：`src/components/techtower/TowerScene.tsx`
- **前置依赖**：需先安装`@react-three/postprocessing`和`postprocessing`依赖
- **具体改动**：
  - 导入EffectComposer和Bloom
  - 在TowerScene JSX内容外围包裹EffectComposer
  - Bloom参数：luminanceThreshold=0.2, luminanceSmoothing=0.9, intensity=0.8
- **验证**：emissive材质在画面中呈现辉光扩散效果，帧率保持30fps以上

## 完成定义

- [ ] T1-T5全部完成
- [ ] 地面在默认视角下清晰可辨（不再全暗）
- [ ] 建筑表面有环境反射（不再纯黑）
- [ ] 霓虹灯管照亮周围物体
- [ ] 窗户呈现室内灯光效果
- [ ] emissive材质有真实辉光
- [ ] 帧率在中端设备上保持30fps以上
- [ ] 无控制台错误或警告
