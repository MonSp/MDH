# 赛博朋克城市场景迭代升级 — 需求规格

## 目标

将当前基于 Three.js + React Three Fiber 实现的赛博朋克3D城市场景从"低密度科技园区"风格系统性迭代至"高密度、高信息量、充满生命力的赛博朋克都市"，在建筑密度、动态广告牌、空中交通、地面生活感、天气效果、建筑细节、光照对比、天空纵深8个维度上逼近理想图效果。

## 范围

- **涉及模块**：`src/components/cyberpunk/` 下全部10个组件 + `src/components/techtower/TowerScene.tsx` 后处理部分
- **技术栈**：Three.js + React Three Fiber + @react-three/drei + @react-three/postprocessing
- **迭代策略**：渐进式4阶段，每阶段独立可验收
- **不在范围内**：CEO顶层公寓结构调整、UI交互逻辑变更、新路由/页面

## 功能要求

### FR-1 高密度建筑群（Phase 1）
- 将 `generateBuildings()` 从当前3环/55栋扩展至5环/200+栋
- 新增近距建筑环（radiusMin=8），建筑间距缩小50%
- 新增楼间空中连桥（SkyBridge）组件，使用发光管道/走廊几何体
- 远景建筑（simplified=true）保留简化版 BuildingDetails，不完全跳过

### FR-2 动态故障艺术广告牌（Phase 1）
- 将 `HolographicAds` 从 Text+PlaneGeometry 升级为 ShaderMaterial 故障艺术效果
- 新增 GlitchText 组件：支持霓虹闪烁、扫描线、色差偏移动画
- 广告牌覆盖率提升至80%建筑立面（每栋至少3个面）
- 新增 mega_billboard 类型支持全楼高度广告

### FR-3 立体空中交通（Phase 2）
- 将 `FlyingVehicles` 从33个扩展至100+
- 实现3层分层航道：低层(8-18)、中层(18-32)、高层(32-50)
- 新增大型飞船（FreightShip）组件：低多边形几何体，缓慢飞行，发光引擎
- 新增密集无人机蜂群（DroneSwarm）组件

### FR-4 天气与氛围增强（Phase 2）
- 将 `CyberRain` 从800粒子扩展至3000+
- 新增 SteamVent（蒸汽喷口）组件：地面/建筑侧面向上喷射蒸汽粒子
- 新增 SmokePlume（烟尘柱）组件：建筑间飘浮的半透明烟尘
- 体积雾层改为动态密度（使用 useFrame 缓慢变化 opacity）

### FR-5 地面生活感（Phase 3）
- 新增 PedestrianFlow（行人粒子流）组件：沿道路方向流动的光点粒子
- 新增 VehicleTraffic（车辆光迹）组件：道路上的尾灯光迹流
- 新增 StreetVendor（街道摊贩）组件：广场区域的发光点和蒸汽粒子

### FR-6 建筑细节保留（Phase 3）
- 修改 `BuildingDetails` 组件，当 `simplified=true` 时生成简化版附件
- 简化版保留：天线 + 1-2个空调外机（不保留管道/阳台/支架）
- 远景建筑视觉细节感提升

### FR-7 高对比度后处理（Phase 4）
- Bloom: luminanceThreshold 从0.6降至0.3，intensity从1.0提升至1.8
- ChromaticAberration: offset 从0.003提升至0.006
- Noise: opacity 从0.1提升至0.15
- Vignette: darkness 从0.4提升至0.6
- 整体形成刺眼霓虹饱和度 + 强明暗对比

### FR-8 天空纵深增强（Phase 4）
- 在 SkyDome Shader 中新增远景建筑剪影层（地平线处黑色锯齿状轮廓）
- 新增大型空中结构剪影（巨型飞船/平台轮廓）
- 增强云层密度和运动速度

## 验收标准

- **AC-1**：当场景初始化完成后，系统 SHALL 渲染200+栋建筑，近环建筑间距不超过原间距的50%，楼间可见发光连桥结构
- **AC-2**：当建筑立面可见时，系统 SHALL 在80%以上建筑立面上显示带故障闪烁、扫描线、色差偏移动画的动态广告牌
- **AC-3**：当场景运行时，系统 SHALL 渲染100+飞行载具分布在3层不同高度航道，包含至少1艘大型飞船和2组无人机蜂群
- **AC-4**：当地面可见时，系统 SHALL 渲染流动的行人粒子光点、车辆尾灯光迹、广场区域蒸汽效果
- **AC-5**：当天气效果开启时，系统 SHALL 渲染3000+雨滴粒子、地面蒸汽喷口、建筑间烟尘柱、动态密度体积雾
- **AC-6**：当远景建筑可见时，系统 SHALL 显示简化版建筑细节附件（天线+空调），而非空白几何体
- **AC-7**：当后处理启用时，场景 SHALL 呈现明显高对比度霓虹饱和度视觉，色差效果可感知
- **AC-8**：当天空穹顶可见时，系统 SHALL 在地平线处显示密集建筑剪影轮廓，天空中显示巨型结构剪影
