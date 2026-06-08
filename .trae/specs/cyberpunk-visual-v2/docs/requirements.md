# 赛博朋克视觉效果V2 — 需求规格

## 目标

将赛博朋克3D场景从当前的简单彩色盒子风格提升到目标图所示的真实赛博朋克夜间城市效果。目标图展示了7个关键视觉差距：建筑纹理缺失、体积雾缺失、湿地面反射缺失、全息广告牌定位错误、飞行载具光迹缺失、建筑几何过简、Bloom效果不足。

## 范围

本需求覆盖以下组件的视觉渲染层改造：
- `CyberpunkBuildings.tsx`：建筑纹理贴图 + 几何复杂度
- `TowerScene.tsx`：体积雾 + Bloom强度
- `CyberpunkGround.tsx`：湿地面反射
- `HolographicAds.tsx`：广告牌贴建筑定位
- `FlyingVehicles.tsx`：载具光迹拖尾

不涉及：现有组件API变更、数据流改造、后端逻辑。

## 功能要求

### FR1 建筑纹理真实化
CyberpunkBuildings当前使用纯色meshPhysicalMaterial，建筑表面无纹理。需要为建筑材质添加程序化生成的纹理贴图（含diffuse/roughness），使建筑表面呈现铁锈/混凝土/金属面板的做旧效果。

### FR2 体积雾大气效果
TowerScene当前使用fog near=60 far=200的浅距离雾，建筑间无大气雾霭。需要调整雾参数（near=5 far=80）并添加多层半透明平面模拟雾层，使建筑之间有浓厚的大气效果。

### FR3 湿地面反射效果
CyberpunkGround当前使用纯色MeshStandardMaterial，地面无反射。需要使用drei的MeshReflectorMaterial替换基础地面材质，使地面呈现湿润反光效果，能映射霓虹灯光和建筑倒影。

### FR4 全息广告牌贴建筑定位
HolographicAds当前将广告牌放置在radius=18-38的空中，不贴建筑。需要重构广告牌生成逻辑，将广告牌紧贴建筑立面（距离建筑表面0.1单位内），朝向建筑外侧。

### FR5 飞行载具光迹效果
FlyingVehicles当前使用简单box/cylinder几何体，无光迹拖尾。需要为每个飞行载具添加Trail光迹效果，使载具运动时留下发光轨迹。

### FR6 建筑几何复杂度提升
CyberpunkBuildings当前每栋建筑是单一boxGeometry。需要为建筑添加退台/面板/天线等结构细节，使用组合几何体。

### FR7 Bloom辉光强度增强
TowerScene当前Bloom intensity=0.8偏弱。需要提升到1.5-2.0范围，使所有霓虹元素呈现强烈辉光扩散。

## 验收标准

- 当CyberpunkBuildings渲染时，系统应为建筑材质加载纹理贴图（含diffuse/normal/roughness），使建筑表面呈现铁锈/混凝土/金属面板的做旧效果。
- 当场景渲染时，系统应使用体积雾或浓距离雾替代当前的浅距离雾，使建筑之间有大气雾霭，近处清晰远处渐隐。
- 当CyberpunkGround渲染地面时，系统应使用MeshReflectorMaterial或envMap+低roughness使地面呈现湿润反光效果，能映射霓虹灯光。
- 当HolographicAds渲染广告牌时，系统应将广告牌紧贴建筑立面（距离建筑表面0.1单位内），而非浮在radius=18-38的空中。
- 当FlyingVehicles渲染飞行汽车时，系统应为载具添加光迹拖尾效果（使用Trail或Line组件），使载具运动时留下发光轨迹。
- 当CyberpunkBuildings生成建筑时，系统应为建筑添加退台/面板/天线等结构细节，使用组合几何体而非单一boxGeometry。
- 当EffectComposer渲染Bloom时，系统应将Bloom intensity提升到1.5-2.0范围，使所有霓虹元素呈现强烈的辉光扩散效果。
