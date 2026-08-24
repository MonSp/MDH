/**
 * PostProcessingEffects — post-processing pipeline extracted for lazy loading
 *
 * Contains EffectComposer with Bloom, ChromaticAberration, Noise, and Vignette.
 * These are purely visual enhancements that can load after the core scene.
 */
import React, { useMemo } from 'react'
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'

interface PostProcessingEffectsProps {
  isDayMode?: boolean
}

/** Night-only chromatic aberration + film grain */
function NightEffects() {
  const offset = useMemo(() => new THREE.Vector2(0.006, 0.006), [])
  return (
    <>
      <ChromaticAberration
        offset={offset}
        radialModulation={true}
        modulationOffset={0.5}
      />
      <Noise
        premultiply
        blendFunction={BlendFunction.ADD}
        opacity={0.15}
      />
    </>
  )
}

export default function PostProcessingEffects({ isDayMode = false }: PostProcessingEffectsProps) {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={isDayMode ? 0.6 : 0.1}
        luminanceSmoothing={0.4}
        intensity={isDayMode ? 0.6 : 1.5}
        radius={0.4}
      />
      {!isDayMode && <NightEffects />}
      <Vignette
        offset={0.3}
        darkness={isDayMode ? 0.2 : 0.6}
      />
    </EffectComposer>
  )
}
