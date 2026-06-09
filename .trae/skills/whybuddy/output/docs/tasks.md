# 赛博朋克城市场景迭代升级 — 任务清单

## 里程碑

| 阶段 | 内容 | 覆盖标准 | 预期交付物 |
|------|------|----------|-----------|
| Phase 1 | 高密度建筑 + 动态广告牌 | sc1, sc2 | CyberpunkBuildings.tsx, SkyBridge.tsx, HolographicAds.tsx, GlitchText.tsx |
| Phase 2 | 空中交通 + 天气效果 | sc3, sc5 | FlyingVehicles.tsx, FreightShip.tsx, DroneSwarm.tsx, CyberRain.tsx, SteamVent.tsx, SmokePlume.tsx |
| Phase 3 | 地面人群 + 建筑细节 | sc4, sc6 | PedestrianFlow.tsx, VehicleTraffic.tsx, StreetVendor.tsx, BuildingDetails.tsx |
| Phase 4 | 光照 + 天空 | sc7, sc8 | TowerScene.tsx(后处理), SkyDome.tsx(Shader) |

## 任务清单

### Phase 1: 高密度建筑群与动态广告牌

| ID | 任务 | 验证方式 | 依赖 |
|----|------|----------|------|
| T1.1 | 重写 `generateBuildings()` 扩展至5环/220+栋布局 | 调用返回220+条数据，环1 radiusMin=8 | 无 |
| T1.2 | 新增 `SkyBridge.tsx` 楼间连桥组件 | 环1-2建筑间可见发光管道 | T1.1 |
| T1.3 | 实现 `GlitchText.tsx` ShaderMaterial 故障艺术组件 | 文字显示故障闪烁+扫描线+色差 | 无 |
| T1.4 | 升级 `HolographicAds.tsx` 覆盖率达80% | 每栋建筑至少3个面有广告牌 | T1.3 |
| T1.5 | 性能测试：220栋+广告牌场景帧率 | 全景视角 > 45fps | T1.1-T1.4 |

### Phase 2: 立体空中交通与天气氛围

| ID | 任务 | 验证方式 | 依赖 |
|----|------|----------|------|
| T2.1 | 扩展 `FlyingVehicles.tsx` 至100+并实现3层航道 | 场景中100+载具在3层高度飞行 | 无 |
| T2.2 | 新增 `FreightShip.tsx` 大型飞船组件 | 可见低多边形飞船缓慢飞行 | 无 |
| T2.3 | 新增 `DroneSwarm.tsx` 无人机蜂群组件 | 可见5-8个无人机编队飞行 | 无 |
| T2.4 | 扩展 `CyberRain.tsx` 至3000+粒子 | 雨滴密度明显提升 | 无 |
| T2.5 | 新增 `SteamVent.tsx` 蒸汽喷口组件 | 广场/建筑底部可见蒸汽粒子 | 无 |
| T2.6 | 新增 `SmokePlume.tsx` 烟尘柱组件 | 建筑间可见半透明烟尘飘浮 | 无 |
| T2.7 | 体积雾层改为动态密度 | 雾层透明度随时间缓慢变化 | 无 |
| T2.8 | 性能测试：全天气+交通场景帧率 | 全景视角 > 45fps | T2.1-T2.7 |

### Phase 3: 地面生活感与建筑细节

| ID | 任务 | 验证方式 | 依赖 |
|----|------|----------|------|
| T3.1 | 新增 `PedestrianFlow.tsx` 行人粒子流组件 | 街道上可见流动光点 | 无 |
| T3.2 | 新增 `VehicleTraffic.tsx` 车辆光迹组件 | 道路上可见尾灯光迹 | 无 |
| T3.3 | 新增 `StreetVendor.tsx` 街道摊贩组件 | 广场可见发光点+蒸汽 | 无 |
| T3.4 | 修改 `BuildingDetails.tsx` 支持 simplified 简化附件 | 远景建筑可见天线+空调 | 无 |
| T3.5 | 性能测试：全场景帧率 | 全景视角 > 45fps | T3.1-T3.4 |

### Phase 4: 光照对比与天空纵深

| ID | 任务 | 验证方式 | 依赖 |
|----|------|----------|------|
| T4.1 | 调整 `TowerScene.tsx` EffectComposer 后处理参数 | 高对比度霓虹视觉可感知 | 无 |
| T4.2 | 在 `SkyDome.tsx` Shader 中新增远景建筑剪影 | 地平线处可见建筑剪影轮廓 | 无 |
| T4.3 | 在 `SkyDome.tsx` 中新增大型空中结构剪影 | 天空中可见巨型结构黑色剪影 | 无 |
| T4.4 | 最终全场景性能测试与优化 | 全景 > 45fps, 近景 > 60fps | T4.1-T4.3 |

## 完成定义

- [ ] 所有任务的验证方式均已通过
- [ ] 全场景帧率 > 45fps（全景视角）
- [ ] 近景视角帧率 > 60fps
- [ ] draw call < 500
- [ ] 无控制台错误/警告
- [ ] fogEnabled 开关仍正常工作
- [ ] OrbitControls 拖拽/旋转/缩放仍正常工作
