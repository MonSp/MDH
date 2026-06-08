import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/* ───────── 渐变天空穹顶 Shader ───────── */

const skyVertexShader = /* glsl */`
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const skyFragmentShader = /* glsl */`
  uniform float uTime;
  varying vec3 vWorldPosition;

  // Simplex 3D noise (优化版)
  vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0/7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float y = dir.y;

    // 三段渐变：顶部深蓝紫 → 中部暗蓝 → 地平线暖橙红
    vec3 topColor    = vec3(0.04, 0.04, 0.18);  // #0a0a2e
    vec3 midColor    = vec3(0.10, 0.10, 0.23);  // #1a1a3a
    vec3 horizonColor = vec3(0.23, 0.13, 0.13); // #3a2020

    vec3 skyColor;
    if (y > 0.3) {
      float t = (y - 0.3) / 0.7;
      skyColor = mix(midColor, topColor, t);
    } else if (y > -0.05) {
      float t = (y + 0.05) / 0.35;
      skyColor = mix(horizonColor, midColor, t);
    } else {
      skyColor = horizonColor;
    }

    // 云层：上半部叠加 Simplex Noise
    if (y > 0.05) {
      float cloudY = (y - 0.05) / 0.95;
      vec3 samplePos = dir * 3.0 + vec3(uTime * 0.008, 0.0, uTime * 0.005);
      float n = snoise(samplePos * 2.0) * 0.5 + 0.5;
      n *= snoise(samplePos * 4.0 + 100.0) * 0.5 + 0.5;
      float cloudDensity = smoothstep(0.35, 0.65, n) * cloudY * 0.35;
      vec3 cloudColor = vec3(0.5, 0.55, 0.65);
      skyColor = mix(skyColor, cloudColor, cloudDensity);
    }

    gl_FragColor = vec4(skyColor, 1.0);
  }
`

/* ───────── 天空穹顶组件 ───────── */

interface SkyDomeProps {
  mode?: 'dusk' | 'night'
}

export default function SkyDome({ mode = 'dusk' }: SkyDomeProps) {
  const matRef = useRef<THREE.ShaderMaterial>(null!)

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
  }), [])

  useFrame(({ clock }) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = clock.elapsedTime
    }
  })

  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[200, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={skyVertexShader}
        fragmentShader={skyFragmentShader}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
