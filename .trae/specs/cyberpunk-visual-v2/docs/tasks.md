# 赛博朋克视觉效果V2 — 任务清单

## 里程碑

### M1 基础氛围（雾+Bloom+反射地面）
优先完成体积雾、Bloom增强和湿地面反射，这三个改动影响最大、代码量最小。

### M2 建筑质感（纹理+几何）
完成建筑纹理程序化生成和几何复杂化，提升建筑真实感。

### M3 动态元素（广告牌+载具光迹）
完成广告牌重定位和飞行载具光迹，增强场景动态感。

## 任务清单

### T1 调整雾参数 + 添加多层雾
- **优先级**：P0
- **改动文件**：`src/components/techtower/TowerScene.tsx`
- **具体改动**：fog near=60→5 far=200→80；添加3-5层y=5/10/15/20的半透明平面
- **验证**：建筑间有浓厚大气雾霭，近处清晰远处渐隐

### T2 提升Bloom强度
- **优先级**：P0
- **改动文件**：`src/components/techtower/TowerScene.tsx`
- **具体改动**：Bloom intensity 0.8→1.8, luminanceThreshold 0.2→0.1
- **验证**：霓虹元素有强烈辉光扩散

### T3 替换地面为MeshReflectorMaterial
- **优先级**：P0
- **改动文件**：src/components/cyberpunk/CyberpunkGround.tsx`
- **具体改动**：导入MeshReflectorMaterial，替换baseGroundPlane的材质
- **验证**：地面能映射霓虹灯光和建筑倒影

### T4 实现建筑纹理程序化生成
- **优先级**：P1
- **改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`
- **具体改动**：添加generateProceduralTexture()函数，为建筑材质添加纹理
- **验证**：建筑表面呈现铁锈/混凝土/金属面板做旧效果

### T5 建筑几何添加退台和细节
- **优先级**：P1
- **改动文件**：`src/components/cyberpunk/CyberpunkBuildings.tsx`
- **具体改动**：每栋建筑由2-3个boxGeometry叠加+随机天线
- **验证**：建筑有退台/面板/天线等结构细节

### T6 重构广告牌生成逻辑
- **优先级**：P2
- **改动文件**：`src/components/cyberpunk/HolographicAds.tsx`
- **具体改动**：从buildings数组读位置，广告牌放置在建筑立面
- **验证**：广告牌紧贴建筑立面，不再浮在空中

### T7 为飞行载具添加Trail光迹
- **优先级**：P2
- **改动文件**：`src/components/cyberpunk/FlyingVehicles.tsx`
- **具体改动**：用drei的Trail组件包裹每个载具
- **验证**：飞行载具有光迹拖尾效果

## 完成定义

- [ ] T1-T7全部完成
- [ ] 建筑有铁锈/混凝土/金属面板纹理
- [ ] 建筑间有浓厚大气雾霭
- [ ] 地面能映射霓虹灯光
- [ ] 广告牌紧贴建筑立面
- [ ] 飞行载具有光迹拖尾
- [ ] 建筑有退台/天线等细节
- [ ] 所有霓虹元素有强烈Bloom辉光
- [ ] 帧率在中端设备上保持30fps以上
