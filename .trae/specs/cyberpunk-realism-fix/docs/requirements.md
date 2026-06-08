# 赛博朋克世界真实感提升 — 需求规格

## 目标

解决赛博朋克3D场景中地面全暗、建筑全暗、霓虹灯管不照明、窗户不发光、缺少后处理辉光等问题。通过深度代码审计发现8个结构性光照/材质缺陷，需要从材质参数、光源布局、后处理管线三个维度全面提升场景真实感，使赛博朋克夜间城市呈现应有的霓虹氛围。

## 范围

本需求覆盖以下组件的改造：
- `CyberpunkGround.tsx`：6种地面材质的emissive参数提升
- `CyberpunkBuildings.tsx`：建筑材质metalness/roughness调优，添加环境反射
- `NeonLights.tsx`：NeonTube组件添加伴随pointLight
- `BuildingScene.tsx`：GlassCurtainWall窗户添加emissive发光
- `TowerScene.tsx`：集成EffectComposer+Bloom后处理，添加Environment组件

不涉及：新建组件、改变场景布局、修改建筑几何形状、调整相机参数。

## 功能要求

### FR1 地面材质亮度提升
CyberpunkGround中6种材质（baseGround、plaza、road、sidewalk、grass、neonLine）的emissiveIntensity需要从当前极低值（0.15-0.6）统一提升到0.4以上，同时color提亮至少20%，确保地面在默认视角下清晰可辨。

### FR2 建筑表面环境反射修复
CyberpunkBuildings的meshPhysicalMaterial当前metalness=0.9、roughness=0.05且无Environment组件，导致金属表面无物可反射呈现纯黑色。需要降低metalness到0.5-0.7范围，提升roughness到0.15-0.25，并在TowerScene中添加Environment组件提供反射环境。

### FR3 霓虹灯管真实照明
NeonTube组件当前使用meshStandardMaterial的emissive属性让灯管自身发光，但不会照亮周围物体。需要为每根灯管添加一个近距离pointLight（distance=5-8, intensity=0.5-1.0），使灯管附近的地面和建筑表面被照亮。

### FR4 建筑窗户发光效果
GlassCurtainWall当前使用transmission=0.6、opacity=0.4的透明玻璃材质，无emissive属性，在暗环境下窗户完全不可见。需要为玻璃材质添加emissive属性（emissiveIntensity=0.3-0.6），模拟室内灯光效果。

### FR5 后处理Bloom辉光
整个TowerScene组件缺少后处理管线，emissive材质不会在画面中呈现真实辉光。需要引入EffectComposer+Bloom后处理，使所有emissive区域（霓虹灯管、装饰环、广告牌等）呈现辉光扩散效果。

## 验收标准

- 当场景渲染地面时，系统应将CyberpunkGround中所有材质的emissiveIntensity提升到0.4以上，使地面在默认视角下清晰可辨。
- 当建筑使用metalness=0.9的材质时，系统应通过添加Environment组件或降低metalness至0.5-0.7范围，确保建筑表面不呈现纯黑色。
- 当NeonTube组件渲染时，系统应为每个灯管附加一个近距离pointLight（distance=5-8, intensity=0.5-1.0），使灯管附近的物体表面被照亮。
- 当GlassCurtainWall渲染窗户玻璃时，系统应为玻璃材质添加emissive属性和emissiveIntensity=0.3-0.6，使窗户在暗环境下呈现室内灯光效果。
- 当场景中存在emissive材质时，系统应通过EffectComposer+Bloom后处理使emissive区域在画面中呈现真实辉光扩散效果。
