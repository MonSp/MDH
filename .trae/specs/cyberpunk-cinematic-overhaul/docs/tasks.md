# 赛博朋克场景电影级视觉跃迁 — 任务清单

## 里程碑

### M1: 大气与天空基础（模块 1 + 2 + 7-色调部分）

完成天空穹顶、体积雾重写、全局色调调整——奠定场景氛围基调。

### M2: 后处理管线（模块 3）

扩展 EffectComposer，加入 ChromaticAberration + Noise + Vignette + ACESFilmic ToneMapping。

### M3: 密度跃迁（模块 4 + 5 + 6）

建筑数量翻倍、全息广告扩展、飞行载具扩展——实现视觉密度跃迁。

### M4: 验证与调优

性能验证、视觉微调、LOD 优化、最终交付。

## 任务清单

### T1: 创建 SkyDome.tsx 天空穹顶组件

- **归属**：M1 / 模块 1
- **描述**：新建 `src/components/cyberpunk/SkyDome.tsx`，实现自定义 ShaderMaterial 渐变天空+程序化云层
- **依赖**：无
- **交付物**：SkyDome.tsx 组件文件
- **验证**：仰视摄像机时可见渐变天空背景和漂浮云层

### T2: TowerScene.tsx 注册 SkyDome

- **归属**：M1 / 模块 1
- **描述**：在 TowerScene.tsx 中导入并渲染 SkyDome 组件，设置 renderOrder=-1000
- **依赖**：T1
- **交付物**：TowerScene.tsx 修改
- **验证**：场景背景从纯暗色变为渐变天空

### T3: 重写 TowerScene.tsx 体积雾层

- **归属**：M1 / 模块 2
- **描述**：将 5 层固定半透明平面替换为 12 层渐变雾平面，含近地面烟尘层
- **依赖**：无
- **交付物**：TowerScene.tsx 修改
- **验证**：远处建筑自然消融，近地面有烟雾感，雾层无明显平面分界

### T4: 调整全局色调参数

- **归属**：M1 / 模块 7
- **描述**：修改 TowerScene/CyberpunkGround/CyberpunkLights 的颜色参数，从暗紫转为冷蓝灰
- **依赖**：无
- **交付物**：TowerScene.tsx、CyberpunkGround.tsx、CyberpunkLights.tsx 修改
- **验证**：场景基底色明显偏冷蓝灰

### T5: 扩展 EffectComposer 后处理管线

- **归属**：M2 / 模块 3
- **描述**：添加 ChromaticAberration + Noise + Vignette，设置 ACESFilmic ToneMapping
- **依赖**：T4
- **交付物**：TowerScene.tsx 修改
- **验证**：画面有暗角、色散、胶片颗粒效果，整体电影感提升

### T6: 扩展 CyberpunkBuildings 建筑数量

- **归属**：M3 / 模块 4
- **描述**：修改建筑生成配置，从 28 栋增至 67 栋，新增简化 LOD 远景建筑
- **依赖**：无
- **交付物**：CyberpunkBuildings.tsx 修改
- **验证**：全景视角可见 50+ 栋建筑，天际线错落有致

### T7: 扩展 HolographicAds 广告密度

- **归属**：M3 / 模块 5
- **描述**：每栋建筑分配 2-4 个广告，新增 mega_billboard 和 neon_strip 类型
- **依赖**：T6（需要更多建筑承载广告）
- **交付物**：HolographicAds.tsx 修改
- **验证**：全场景广告 30+ 个，建筑立面覆盖 60%+

### T8: 扩展 FlyingVehicles 载具数量

- **归属**：M3 / 模块 6
- **描述**：载具从 15 增至 30，新增大型运输飞船类型
- **依赖**：无
- **交付物**：FlyingVehicles.tsx 修改
- **验证**：空中 25+ 架载具运行，含 3 架大型运输飞船

### T9: 性能验证与 LOD 优化

- **归属**：M4
- **描述**：在目标设备上验证帧率，必要时对远景建筑/广告进行 LOD 优化
- **依赖**：T1-T8 全部完成
- **交付物**：性能测试报告，必要时的代码优化
- **验证**：中端设备帧率 ≥30 FPS

### T10: 视觉微调与最终交付

- **归属**：M4
- **描述**：根据实际渲染效果微调参数（雾浓度、Bloom 强度、色调等）
- **依赖**：T9
- **交付物**：最终参数配置
- **验证**：视觉效果接近图2目标方向

## 完成定义

1. 所有 10 个任务标记为完成
2. TypeScript 类型检查通过
3. 中端设备帧率 ≥30 FPS
4. 8 条成功标准（sc1-sc8）全部通过验收
5. 场景视觉效果经用户评审确认
