# 赛博朋克视觉效果V2 — 设计规格

## 设计目标

在不改变现有组件API和数据流的前提下，通过纹理贴图、体积雾、反射地面、广告牌重定位、载具光迹、几何复杂化、Bloom增强7个维度，将赛博朋克场景从简单彩色盒子提升到目标图所示的真实效果。

## 模块划分

### M1 建筑纹理程序化生成
**改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`

使用Canvas API程序化生成3种纹理类型（铁锈/混凝土/金属面板）的diffuse和roughness贴图，每栋建筑随机分配1-2种。meshPhysicalMaterial改为MeshStandardMaterial+textureMap。在组件顶部添加generateProceduralTexture()工具函数。

### M2 体积雾实现
**改动文件**：`src/components/techtower/TowerScene.tsx`

将fog参数从near=60 far=200调整为near=5 far=80，使雾更浓更近。在TowerScene中添加3-5层半透明平面（y=5/10/15/20）模拟体积雾层，使用meshBasicMaterial transparent opacity=0.05-0.15。

### M3 湿地面反射
**改动文件**：`src/components/cyberpunk/CyberpunkGround.tsx`

使用drei的MeshReflectorMaterial替换baseGroundMaterial的GroundPlane渲染。配置：blur=[300,100] resolution=1024 mixBlur=10 mixStrength=40 roughness=1。霓虹环/道路线等装饰层保持在反射地面之上。

### M4 广告牌贴建筑
**改动文件**：`src/components/cyberpunk/HolographicAds.tsx`

重构generateAds()：读取CyberpunkBuildings的buildings数据，为每栋建筑分配0-2个广告牌，放置在建筑立面（r=width/2+0.1），朝向建筑外侧。

### M5 飞行载具光迹
**改动文件**：`src/components/cyberpunk/FlyingVehicles.tsx`

使用drei的Trail组件包裹每个FlyingVehicle：trailLength=5, attenuation=0.5, color=载具尾焰颜色。为每个载具添加useFrame中的历史位置追踪。

### M6 建筑几何复杂化
**改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`

每栋建筑由2-3个boxGeometry叠加：主体(80%高度) + 退台(60%高度,80%宽度) + 顶部结构(10%高度)。使用useMemo缓存。随机添加1-3根天线/管道。

### M7 Bloom强度提升
**改动文件**：`src/components/techtower/TowerScene.tsx`

将Bloom intensity从0.8提升到1.8，luminanceThreshold从0.2降低到0.1，使更多emissive区域产生辉光。

## 失败处理策略

### 纹理生成性能问题
如果程序化纹理生成导致首帧加载过慢，将纹理生成移到Web Worker中异步执行。

### MeshReflectorMaterial性能问题
如果反射地面导致帧率下降超过30%，降低resolution到512或减少blur参数。

### 体积雾层数过多
如果5层雾平面导致性能问题，减少到2-3层。

### 广告牌与建筑碰撞
如果广告牌贴建筑后与建筑几何体重叠，添加z-fighting偏移(0.01)。

## 质量控制

- 每个模块改动后在浏览器中验证视觉效果
- 使用Chrome DevTools Performance面板监控帧率
- 所有材质参数改动保留原始值作为注释
- 纹理贴图使用Canvas API程序化生成，不依赖外部资源
