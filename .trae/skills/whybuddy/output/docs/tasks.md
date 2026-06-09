# 电影级赛博朋克城市场景升级 — 任务清单

## 里程碑

- **M1（基础设施）**：PBR 纹理加载管线 + InstancedMesh 建筑系统
- **M2（视觉增强）**：全息广告牌 + 灯光阴影 + 后处理升级
- **M3（动态效果）**：多层粒子系统 + 相机/雾效调整
- **M4（集成验收）**：TowerScene 集成 + 性能验证

## 任务清单

### T1: 实现 PBRTextureLoader 工具 [M1]
- 创建 `src/components/cyberpunk/PBRTextureLoader.ts`
- 定义 3 组 PBR 贴图路径配置
- 实现 TextureLoader 异步加载逻辑
- 实现 Canvas 程序化纹理 fallback
- 创建 `public/textures/` 目录结构

### T2: 实现 CyberpunkCityInstanced 组件 [M1]
- 创建 `src/components/cyberpunk/CyberpunkCityInstanced.tsx`
- 实现 `generateCityLayout()` 布局生成算法（8 环，500+ 栋）
- 实现 6 个 InstancedMesh（3 材质 x 2 段退台）
- 集成 PBRTextureLoader 加载材质
- 设置 instanceMatrix 变换矩阵
- 实现建筑间距检测避免重叠

### T3: 实现 HolographicBillboard 组件 [M2]
- 创建或升级全息广告牌组件
- 实现 3 类 Canvas 动态纹理生成
- 使用 PlaneGeometry + emissiveMap 挂载到建筑外墙
- 确保发光强度被 Bloom 拾取

### T4: 升级灯光阴影系统 [M2]
- 修改 TowerScene 的 renderer 配置：PCFSoftShadowMap
- 调整方向光阴影参数
- 优化点光源布局和颜色
- 确保建筑投射和接收阴影

### T5: 升级后处理管线 [M2]
- 修改 TowerScene 的 EffectComposer 配置
- Bloom 参数调整为 threshold=0.1, intensity=1.5, radius=0.4
- 保留 ChromaticAberration、Noise、Vignette
- 可选添加 FilmPass 色彩分级

### T6: 实现 CyberpunkParticles 多层粒子组件 [M3]
- 创建 `src/components/cyberpunk/CyberpunkParticles.tsx`
- 实现低层车流粒子（500 个，暖黄色）
- 实现中层飞行器尾迹粒子（200 个，红/蓝）
- 实现高层灰尘粒子（800 个，白色）
- Canvas 生成模糊圆点粒子纹理
- useFrame 动态更新 BufferGeometry position

### T7: 修改 TowerScene 相机与雾效 [M3]
- 将 `<fog>` 改为 `<fogExp>`（FogExp2）
- 雾颜色改为 `#0a0a1a`，密度 0.015-0.025
- 背景色改为深暗紫黑色
- OrbitControls 初始位置调整为 60-70 度俯视
- 调整 minPolarAngle/maxPolarAngle 限制

### T8: 集成所有组件到 TowerScene [M4]
- 替换 `<CyberpunkBuildings>` 为 `<CyberpunkCityInstanced>`
- 添加 `<CyberpunkParticles>` 组件
- 添加 `<HolographicBillboard>` 组件
- 确保主塔楼交互功能不受影响
- 验证 SkyBridge 等依赖 buildings 数据的组件兼容性

### T9: 性能验证与优化 [M4]
- 验证 500+ 栋建筑帧率 ≥ 30fps
- 验证粒子系统不造成卡顿
- 验证后处理管线稳定运行
- 必要时调整 LOD / 建筑数量 / 粒子数量

## 完成定义

- [ ] 500+ 栋建筑使用 InstancedMesh 渲染，帧率 ≥ 30fps
- [ ] 3 种 PBR 材质贴图正确加载，fallback 机制工作正常
- [ ] FogExp2 指数雾效果正确，远处建筑消隐
- [ ] 全息广告牌 Canvas 动态生成，3 种类型可见
- [ ] PCFSoftShadowMap 阴影正确渲染
- [ ] Bloom 后处理参数正确，霓虹光晕明显
- [ ] 3 层粒子系统独立运行
- [ ] 主塔楼项目管理交互功能正常
- [ ] TypeScript 编译无错误
