# 赛博朋克场景视觉升阶 — 任务清单

## 里程碑

### M1: PBR 纹理通道补齐
**目标**：为建筑材质新增 normalMap 和 metalnessMap，增强 roughnessMap
**包含任务**：T1, T2, T3, T4
**依赖**：无

### M2: 雾光平衡与后处理调优
**目标**：消除"黑暗洞穴"，实现霓虹穿透雾的辉光效果
**包含任务**：T5, T6, T7, T8
**依赖**：无（M1 和 M2 可并行）

### M3: 性能验证
**目标**：确保升级后场景在中端设备上保持 ≥30 FPS
**包含任务**：T9
**依赖**：M1, M2

## 任务清单

### T1: 实现 generateNormalMap 程序化纹理函数
- **里程碑**：M1
- **描述**：在 CyberpunkBuildings.tsx 中新增 generateNormalMap(seed: number, type: 'rust' | 'concrete' | 'metal') 函数。使用 Canvas 2D 先生成灰度 height map，再通过 Sobel 算子推导切线空间法线向量，编码为 RGB 输出。三种类型差异化处理梯度幅度。
- **输出**：修改 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：函数返回 THREE.CanvasTexture，wrapS/wrapT 设为 RepeatWrapping

### T2: 实现 generateMetalnessMap 程序化纹理函数
- **里程碑**：M1
- **描述**：在 CyberpunkBuildings.tsx 中新增 generateMetalnessMap(seed: number, type: 'rust' | 'concrete' | 'metal') 函数。rust 类型边缘高金属度、concrete 全局低金属度、metal 面板区域高金属度。
- **输出**：修改 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：函数返回 THREE.CanvasTexture，不同 type 的亮度分布符合设计规格

### T3: 增强 CyberBuilding roughnessMap 对比度
- **里程碑**：M1
- **描述**：为 roughnessMap 使用独立种子生成更高对比度的纹理。锈蚀区域粗糙度 0.8-1.0，金属光滑区域 0.2-0.4。在 generateProceduralTexture 的 roughness 分支中增加污渍/水痕的粗糙度变化。
- **输出**：修改 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：roughnessMap 的 Canvas 像素值分布应覆盖 50-255 范围

### T4: 升级 CyberBuilding 材质绑定
- **里程碑**：M1
- **描述**：在 CyberBuilding 组件的 meshStandardMaterial（主体和退台）中新增 normalMap、normalScale、metalnessMap 属性绑定。使用 useMemo 缓存新纹理的生成。
- **输出**：修改 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：浏览器 DevTools 中检查 Three.js material 对象应包含 normalMap 和 metalnessMap 属性

### T5: 修改 TowerScene 雾色和背景色
- **里程碑**：M2
- **描述**：将 TowerScene.tsx 中 fog args 颜色从 #1a0a2e 改为 #1a1a2e，far 从 80 改为 100。background args 颜色同步改为 #1a1a2e。
- **输出**：修改 src/components/techtower/TowerScene.tsx
- **验证**：场景背景色和雾色在浏览器中呈现带蓝灰亮度的深色调

### T6: 同步体积雾层颜色
- **里程碑**：M2
- **描述**：将 TowerScene.tsx 中 5 层体积雾的 meshBasicMaterial color 从 #1a0a2e 改为 #1a1a2e。
- **输出**：修改 src/components/techtower/TowerScene.tsx
- **验证**：体积雾层颜色与场景雾色一致

### T7: 调整 Bloom 后处理参数和 emissive 分级
- **里程碑**：M2
- **描述**：将 TowerScene 中 Bloom 的 luminanceThreshold 从 0.1 改为 0.6，intensity 从 1.8 改为 1.2，luminanceSmoothing 从 0.9 改为 0.4。同时调整 CyberBuilding 建筑主体 emissiveIntensity 从 0.15 改为 3.0，退台从 0.1 改为 2.0，天台从 0 改为 0.5，窗户条带从 1.5-3.0 改为 5.0-8.0。
- **输出**：修改 src/components/techtower/TowerScene.tsx 和 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：霓虹灯和窗户产生可见辉光，建筑主体不泛白

### T8: 提升霓虹灯管和广告牌 emissive
- **里程碑**：M2
- **描述**：NeonLights.tsx 中 NeonTube 基线 emissiveIntensity 从 1.5 改为 2.0，脉冲范围改为 2.0±1.0。HolographicAds.tsx 中辉光背景板 emissiveIntensity 从 0.5 改为 2.0。
- **输出**：修改 src/components/cyberpunk/NeonLights.tsx 和 src/components/cyberpunk/HolographicAds.tsx
- **验证**：霓虹灯管在雾中可见辉光扩散

### T9: 性能验证与纹理缓存检查
- **里程碑**：M3
- **描述**：确认所有新增纹理函数（generateNormalMap、generateMetalnessMap）在 CyberBuilding 组件中通过 useMemo 缓存。检查新增纹理数量（每栋建筑 2 张新纹理 × 20 栋 = 40 张 256x256 纹理），确认总显存占用在可接受范围内。
- **输出**：审查 src/components/cyberpunk/CyberpunkBuildings.tsx
- **验证**：浏览器 Performance 面板中 FPS ≥ 30，无纹理相关的内存泄漏

## 完成定义

1. CyberBuilding 的 MeshStandardMaterial 绑定 normalMap、metalnessMap、增强版 roughnessMap
2. TowerScene 雾色为 #1a1a2e，背景色同步，体积雾层同步
3. Bloom luminanceThreshold ≥ 0.6，intensity 在 1.0-1.5 范围
4. 建筑主体 emissiveIntensity ≥ 3.0，窗户条带 ≥ 5.0
5. 霓虹灯管脉冲范围覆盖 1.0-3.0
6. 场景在中端设备上 ≥30 FPS
7. 前端 TypeScript 类型检查通过
