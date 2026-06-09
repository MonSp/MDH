# 电影级赛博朋克城市场景升级 — 需求规格

## 目标

将现有 React Three Fiber 赛博朋克城市三维场景从约 92 栋独立 Mesh 建筑升级为 500+ 栋 InstancedMesh 批量渲染的电影级视觉质量场景。保持现有俯视/鸟瞰视角不变，保持主塔楼项目管理交互功能完整。

## 范围

- 建筑系统：从独立 Mesh 退台堆叠改为 InstancedMesh 批量渲染，500+ 栋建筑
- 材质系统：从 Canvas 程序化纹理升级为 ambientCG PBR 贴图 + fallback
- 雾效系统：从线性 Fog 升级为 FogExp2 指数雾
- 后处理：从 Bloom(0.3,0.4,1.8) 升级为 UnrealBloomPass(0.1,1.5,0.4)
- 广告牌：升级全息广告牌系统，Canvas 动态生成霓虹文字/图案
- 灯光：增强阴影系统（PCFSoftShadowMap），优化点光源布局
- 粒子：新增 3 层专用粒子系统（车流/飞行器/灰尘）
- 相机：调整为 60-70 度俯视角度

## 功能要求

### FR1: InstancedMesh 批量建筑渲染

- 使用 THREE.InstancedMesh 渲染 500+ 栋建筑
- 每栋建筑通过 Matrix4 设置位置、旋转、缩放
- 建筑高度、宽度、位置、材质索引随机化
- 建筑分为 3 种材质组：混凝土、锈蚀金属、脏污玻璃
- 退台效果简化为两段式（底部宽 + 顶部窄），使用两个 InstancedMesh
- 使用 pseudoRandom 确定性生成，结果可复现

### FR2: PBR 材质纹理系统

- 从 ambientCG.com 加载 CC0 免费 PBR 贴图
- 混凝土：Concrete048 — 颜色、粗糙度、法线贴图（https://ambientcg.com/view?id=Concrete048）
- 锈蚀金属：Metal053C — 颜色、粗糙度、法线、金属度贴图（https://ambientcg.com/view?id=Metal053C）
- 脏污玻璃幕墙：Facade009 — 颜色、粗糙度、法线贴图（https://ambientcg.com/view?id=Facade009）
- 贴图放入 public/textures/ 目录
- 加载失败时自动 fallback 到 Canvas 程序化纹理或纯色 MeshStandardMaterial

### FR3: 俯视视角与指数雾氛围

- 相机使用透视投影，俯视角约 60-70 度（非完全垂直）
- FogExp2 指数雾，颜色深蓝紫色 #0a0a1a
- 雾密度足够大，让远处建筑消隐在雾中
- 场景背景色为深暗紫黑色，模拟光污染夜空

### FR4: 全息广告牌系统

- 在建筑外墙上放置发光全息广告牌
- 使用 Canvas 2D API 动态生成：
  - 中文霓虹文字（如"赛博朋克"、"未来科技"）
  - 英文/假名文字
  - 简单几何发光图案（圆形、三角形、线条）
- 生成 CanvasTexture 作为 emissiveMap
- 每栋建筑随机分配 1-2 面广告牌
- 使用 Sprite 或 PlaneGeometry 挂载
- 颜色以青色、品红、暖黄为主

### FR5: 灯光与阴影系统

- renderer.shadowMap 启用，类型 PCFSoftShadowMap
- 至少 1 个方向光带阴影（模拟月光/探照灯），从上方斜射
- 阴影贴图分辨率 2048x2048
- 多个点光源/聚光灯，颜色以青色、品红、暖黄为主
- 灯光脉冲动画增强霓虹氛围

### FR6: 后处理管线

- UnrealBloomPass：阈值 0.1，强度 1.5，半径 0.4
- 所有霓虹广告牌、窗户、发光粒子产生强烈光晕
- 可选 FilmPass 或色彩分级增强电影感
- 保留现有 ChromaticAberration、Noise、Vignette 效果

### FR7: 多层粒子系统

- 低层：暖黄色粒子沿街道流动，模拟车流
- 中层：红色/蓝色粒子缓慢移动，模拟飞行器尾迹
- 高层：白色细小粒子缓缓飘落，模拟灰尘/数据碎屑
- 所有粒子使用 BufferGeometry，动态更新复用同一几何体
- 粒子纹理使用 Canvas 绘制的模糊圆点

## 验收标准

- AC1 (sc1): 当场景加载完成时，系统应使用 InstancedMesh 渲染不少于 500 栋建筑，帧率不低于 30fps（中端 GPU）。
- AC2 (sc2): 当建筑材质初始化时，系统应加载至少 3 种 ambientCG PBR 贴图组合，若加载失败则自动 fallback 到纯色材质，不产生黑块或报错。
- AC3 (sc3): 当相机初始化时，系统应以透视投影、60-70 度俯视角呈现场景，FogExp2 深蓝紫色雾让远处建筑消隐。
- AC4 (sc4): 当建筑生成时，系统应在建筑外墙上放置至少 3 类发光全息广告牌，使用 Canvas 动态生成霓虹文字和图案作为 emissiveMap，广告牌在暗环境中清晰可见。
- AC5 (sc5): 当场景渲染时，系统应使用 PCFSoftShadowMap 阴影渲染，至少 1 个方向光投射阴影，多个青/品红/暖黄点光源营造霓虹氛围。
- AC6 (sc6): 当场景渲染时，后处理管线的 Bloom 效果应使用阈值 0.1、强度 1.5、半径 0.4 参数，霓虹元素产生明显光晕。
- AC7 (sc7): 当场景运行时，系统应渲染 3 层 BufferGeometry 粒子系统：低层暖黄车流、中层红蓝飞行器尾迹、高层白色灰尘飘落，各层粒子独立运动。
