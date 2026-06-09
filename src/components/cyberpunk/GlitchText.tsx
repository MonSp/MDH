import React, { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

/* ───────── Glitch Shader Material ───────── */

const glitchVertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const glitchFragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uGlitchIntensity;
  uniform sampler2D uMap;
  varying vec2 vUv;
  
  // 伪随机函数
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  
  void main() {
    vec2 uv = vUv;
    
    // 扫描线效果
    float scanline = sin(uv.y * 150.0 + uTime * 8.0) * 0.5 + 0.5;
    scanline = smoothstep(0.3, 0.7, scanline);
    
    // RGB偏移
    float rgbShift = uGlitchIntensity * 0.01;
    vec4 colorR = texture2D(uMap, uv + vec2(rgbShift, 0.0));
    vec4 colorG = texture2D(uMap, uv);
    vec4 colorB = texture2D(uMap, uv - vec2(rgbShift, 0.0));
    
    // 闪烁效果
    float flicker = random(vec2(uTime * 0.1, 0.0));
    flicker = step(0.95, flicker) * 0.3 + 0.7;
    
    // 水平撕裂效果
    float tearLine = step(0.98, random(vec2(floor(uTime * 10.0), floor(uv.y * 20.0))));
    uv.x += tearLine * 0.05 * uGlitchIntensity;
    
    // 组合效果
    vec3 finalColor = vec3(colorR.r, colorG.g, colorB.b);
    finalColor *= flicker;
    finalColor *= (0.8 + scanline * 0.2);
    
    // 辉光边缘
    float edge = smoothstep(0.0, 0.1, uv.x) * smoothstep(1.0, 0.9, uv.x);
    edge *= smoothstep(0.0, 0.1, uv.y) * smoothstep(1.0, 0.9, uv.y);
    finalColor += uColor * edge * 0.3;
    
    gl_FragColor = vec4(finalColor, colorG.a);
  }
`

/* ───────── GlitchText 组件 ───────── */

interface GlitchTextProps {
  text: string
  color?: string
  fontSize?: number
  position?: [number, number, number]
  glitchIntensity?: number
  maxWidth?: number
  anchorX?: 'left' | 'center' | 'right'
  anchorY?: 'top' | 'middle' | 'bottom'
}

export default function GlitchText({
  text,
  color = '#00ffff',
  fontSize = 1,
  position = [0, 0, 0],
  glitchIntensity = 1.0,
  maxWidth = 10,
  anchorX = 'center',
  anchorY = 'middle'
}: GlitchTextProps) {
  const [useShader, setUseShader] = useState(true)
  const [shaderError, setShaderError] = useState(false)
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const fallbackRef = useRef<THREE.MeshStandardMaterial>(null!)
  const textRef = useRef<any>(null!)

  // 检测 Shader 支持
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) {
        setUseShader(false)
        setShaderError(true)
        return
      }

      const testShader = gl.createShader(gl.FRAGMENT_SHADER)!
      gl.shaderSource(testShader, glitchFragmentShader)
      gl.compileShader(testShader)

      if (!gl.getShaderParameter(testShader, gl.COMPILE_STATUS)) {
        setUseShader(false)
        setShaderError(true)
      }
      gl.deleteShader(testShader)
    } catch (e) {
      setUseShader(false)
      setShaderError(true)
    }
  }, [])

  // Shader 版本的材质
  const shaderMaterial = useMemo(() => {
    if (!useShader) return null

    return new THREE.ShaderMaterial({
      vertexShader: glitchVertexShader,
      fragmentShader: glitchFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uGlitchIntensity: { value: glitchIntensity },
        uMap: { value: null }
      },
      transparent: true,
      side: THREE.DoubleSide
    })
  }, [useShader, color, glitchIntensity])

  // 降级版本的材质
  const fallbackMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    })
  }, [color])

  // 动画更新
  useFrame(({ clock }) => {
    const time = clock.elapsedTime

    if (useShader && materialRef.current) {
      materialRef.current.uniforms.uTime.value = time
      materialRef.current.uniforms.uGlitchIntensity.value = glitchIntensity
    }

    if (!useShader && fallbackRef.current) {
      // 降级版本的闪烁效果
      const flicker = Math.random() > 0.95 ? 0.3 : 1.0
      const pulse = Math.sin(time * 5) * 0.2 + 0.8
      fallbackRef.current.emissiveIntensity = pulse * flicker * glitchIntensity

      // 模拟扫描线（透明度变化）
      const scanline = Math.sin(time * 10) * 0.1 + 0.9
      fallbackRef.current.opacity = scanline * 0.9
    }
  })

  // 捕获 Shader 编译错误
  const handleShaderError = () => {
    setUseShader(false)
    setShaderError(true)
  }

  return (
    <group position={position}>
      {useShader && shaderMaterial ? (
        <Text
          ref={textRef}
          fontSize={fontSize}
          maxWidth={maxWidth}
          anchorX={anchorX}
          anchorY={anchorY}
          material={shaderMaterial}
          onSync={() => {
            // 更新纹理
            if (textRef.current && textRef.current.material) {
              const textMaterial = textRef.current.material
              if (textMaterial.map) {
                shaderMaterial.uniforms.uMap.value = textMaterial.map
              }
            }
          }}
          onError={handleShaderError}
        >
          {text}
        </Text>
      ) : (
        <Text
          ref={textRef}
          fontSize={fontSize}
          maxWidth={maxWidth}
          anchorX={anchorX}
          anchorY={anchorY}
          material={fallbackMaterial}
        >
          {text}
        </Text>
      )}
    </group>
  )
}

/* ───────── GlitchAd 组件（简化版，用于广告牌） ───────── */

interface GlitchAdProps {
  text: string
  color?: string
  width?: number
  height?: number
  glitchIntensity?: number
}

export function GlitchAd({
  text,
  color = '#00ffff',
  width = 3,
  height = 1.5,
  glitchIntensity = 1.0
}: GlitchAdProps) {
  const [useShader, setUseShader] = useState(true)
  const materialRef = useRef<THREE.ShaderMaterial>(null!)
  const fallbackRef = useRef<THREE.MeshStandardMaterial>(null!)

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!gl) {
        setUseShader(false)
        return
      }

      const testShader = gl.createShader(gl.FRAGMENT_SHADER)!
      gl.shaderSource(testShader, glitchFragmentShader)
      gl.compileShader(testShader)

      if (!gl.getShaderParameter(testShader, gl.COMPILE_STATUS)) {
        setUseShader(false)
      }
      gl.deleteShader(testShader)
    } catch (e) {
      setUseShader(false)
    }
  }, [])

  const shaderMaterial = useMemo(() => {
    if (!useShader) return null

    return new THREE.ShaderMaterial({
      vertexShader: glitchVertexShader,
      fragmentShader: glitchFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(color) },
        uGlitchIntensity: { value: glitchIntensity },
        uMap: { value: null }
      },
      transparent: true,
      side: THREE.DoubleSide
    })
  }, [useShader, color, glitchIntensity])

  const fallbackMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: color,
      emissive: color,
      emissiveIntensity: 1.0,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
    })
  }, [color])

  useFrame(({ clock }) => {
    const time = clock.elapsedTime

    if (useShader && materialRef.current) {
      materialRef.current.uniforms.uTime.value = time
      materialRef.current.uniforms.uGlitchIntensity.value = glitchIntensity
    }

    if (!useShader && fallbackRef.current) {
      const flicker = Math.random() > 0.95 ? 0.3 : 1.0
      const pulse = Math.sin(time * 5) * 0.2 + 0.8
      fallbackRef.current.emissiveIntensity = pulse * flicker * glitchIntensity
      fallbackRef.current.opacity = (Math.sin(time * 10) * 0.1 + 0.9) * 0.9
    }
  })

  return (
    <group>
      {/* 背景板 */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[width + 0.8, height + 0.8]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={2.0}
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 主背景 */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial
          color="#151530"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 文字层 */}
      <Text
        position={[0, 0, 0.02]}
        fontSize={height * 0.5}
        color={color}
        anchorX="center"
        anchorY="middle"
        material={useShader ? shaderMaterial : fallbackMaterial}
      >
        {text}
      </Text>

      {/* 霓虹边框 */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={8}
            array={new Float32Array([
              -width / 2, -height / 2, 0,
              width / 2, -height / 2, 0,
              width / 2, -height / 2, 0,
              width / 2, height / 2, 0,
              width / 2, height / 2, 0,
              -width / 2, height / 2, 0,
              -width / 2, height / 2, 0,
              -width / 2, -height / 2, 0
            ])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={0.8} />
      </lineSegments>

      {/* 扫描线动画 */}
      {useShader && (
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[width, 0.02]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={3.0}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </group>
  )
}
