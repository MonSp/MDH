# 赛博朋克场景建筑逼真度与材质系统全栈升级 — 任务清单

## 里程碑

### M1: 建筑几何系统基础（模块 1 + 2）

完成 ExtrudeGeometry 建筑轮廓生成器和建筑细节附件系统——奠定建筑几何基础。

### M2: 窗户与材质系统（模块 3 + 4）

完成 InstancedMesh 窗户渲染器和 MeshPhysicalMaterial 材质参数系统——实现窗户实例化和高级 PBR 材质。

### M3: 主组件重写与风格集成（模块 5 + 6）

重写 CyberpunkBuildings.tsx 主组件，集成高度分布算法和三种建筑风格——实现完整的建筑系统升级。

### M4: 全栈整合与验证（模块 7）

整合大气系统兼容性、性能验证、视觉微调——确保全栈升级的完整性和性能达标。

## 任务清单

### T1: 创建 BuildingProfileGenerator 建筑轮廓生成器

- **归属**：M1 / 模块 1
- **描述**：新建 `src/components/cyberpunk/BuildingProfileGenerator.ts`，实现 `generateBuildingProfile()` 函数，使用 THREE.Shape + THREE.ExtrudeGeometry 生成带退台/凹凸的建筑几何体。支持三种风格（glass/brick/industrial）的轮廓模板。
- **依赖**：无
- **交付物**：BuildingProfileGenerator.ts 文件
- **验证**：生成的 ExtrudeGeometry 有可辨识的退台和凹凸轮廓，轮廓点数 ≤ 50

### T2: 创建 BuildingDetails 建筑细节附件组件

- **归属**：M1 / 模块 2
- **描述**：新建 `src/components/cyberpunk/BuildingDetails.tsx`，实现空调外机、管道、阳台、广告牌支架等细节附件的生成和放置。通过 seed 确定性放置，远景建筑跳过。
- **依赖**：无
- **交付物**：BuildingDetails.tsx 文件
- **验证**：每栋非简化建筑上可见空调外机、管道等细节元素

### T3: 创建 BuildingWindows InstancedMesh 窗户渲染器

- **归属**：M2 / 模块 3
- **描述**：新建 `src/components/cyberpunk/BuildingWindows.tsx`，使用 THREE.InstancedMesh 渲染约 200 个窗户实例/栋。实现网格布局、随机点亮（60%）、emissive 发光、toneMapped=false、脉冲动画。
- **依赖**：无
- **交付物**：BuildingWindows.tsx 文件
- **验证**：每栋建筑立面有约 200 个独立窗户实例，约 60% 发光，Bloom 产生辉光

### T4: 创建 BuildingMaterials 材质参数系统

- **归属**：M2 / 模块 4
- **描述**：新建 `src/components/cyberpunk/BuildingMaterials.ts`，定义三种建筑风格的 MeshPhysicalMaterial 参数集（glass/brick/industrial），导出 `createBuildingMaterial()` 工厂函数。
- **依赖**：无
- **交付物**：BuildingMaterials.ts 文件
- **验证**：三种风格的材质参数正确，glass 有 clearcoat=1.0，brick 有 roughness=0.85

### T5: 重写 CyberpunkBuildings.tsx 主组件

- **归属**：M3 / 模块 5
- **描述**：重写 CyberpunkBuildings.tsx，将 CyberBuilding 组件从 BoxGeometry+MeshStandardMaterial 改为 ExtrudeGeometry+MeshPhysicalMaterial+InstancedMesh+BuildingDetails。集成 BuildingProfileGenerator、BuildingWindows、BuildingDetails、BuildingMaterials 四个新模块。
- **依赖**：T1, T2, T3, T4
- **交付物**：CyberpunkBuildings.tsx 重写
- **验证**：建筑使用 ExtrudeGeometry 几何体、MeshPhysicalMaterial 材质、InstancedMesh 窗户

### T6: 实现城市高度分布算法

- **归属**：M3 / 模块 6
- **描述**：修改 `generateBuildings()` 函数，使用距离衰减函数 `height = 10 + 70 * (1 - clamp(r/80, 0, 1)^1.5)` 控制建筑高度。新增 `style` 字段（40% glass / 30% brick / 30% industrial）。
- **依赖**：T5
- **交付物**：CyberpunkBuildings.tsx 中的 generateBuildings() 修改
- **验证**：中心建筑高度 40-80，边缘 10-25，三种风格按比例分配

### T7: 整合大气系统兼容性

- **归属**：M4 / 模块 7
- **描述**：确认 SkyDome、体积雾、后处理管线与新建筑材质系统兼容。确认 Environment HDR 反射在 MeshPhysicalMaterial clearcoat 上正确工作，Bloom 正确响应 emissive 窗户。
- **依赖**：T5, T6
- **交付物**：TowerScene.tsx 兼容性确认（必要时微调）
- **验证**：SkyDome、体积雾、后处理与新建筑正常协作，无渲染异常

### T8: 性能验证与 LOD 优化

- **归属**：M4
- **描述**：在目标设备上验证帧率。确认远景建筑（simplified=true）使用 BoxGeometry + 50 个窗户实例。必要时调整 InstancedMesh 数量或 ExtrudeGeometry 复杂度。
- **依赖**：T1-T7 全部完成
- **交付物**：性能测试报告，必要时的代码优化
- **验证**：中端设备帧率 ≥30 FPS

### T9: 视觉微调与最终交付

- **归属**：M4
- **描述**：根据实际渲染效果微调参数——材质 clearcoat 强度、窗户发光亮度、建筑轮廓凹凸幅度、高度分布曲线等。
- **依赖**：T8
- **交付物**：最终参数配置
- **验证**：视觉效果达到电影级逼真标准

## 完成定义

1. 所有 9 个任务标记为完成
2. TypeScript 类型检查通过
3. 中端设备帧率 ≥30 FPS
4. 10 条成功标准（sc1-sc10）全部通过验收
5. 场景视觉效果经用户评审确认
