/**
 * CyberpunkSceneElements — decorative 3D effects extracted for lazy loading
 *
 * Contains all heavy cyberpunk city visuals: buildings, vehicles, rain,
 * neon lights, drones, smoke, pedestrians, traffic, and vendors.
 * These are purely decorative and do not affect core layout or interaction.
 */
import React, { useMemo } from 'react'
import { FlyingVehicles, CyberRain, NeonLights, generateBuildings, CyberpunkCityInstanced, HolographicBillboard, CyberpunkParticles, generateCityLayout } from '../cyberpunk'
import SkyBridge from '../cyberpunk/SkyBridge'
import FreightShip from '../cyberpunk/FreightShip'
import DroneSwarm from '../cyberpunk/DroneSwarm'
import SteamVent from '../cyberpunk/SteamVent'
import SmokePlume from '../cyberpunk/SmokePlume'
import PedestrianFlow from '../cyberpunk/PedestrianFlow'
import VehicleTraffic from '../cyberpunk/VehicleTraffic'
import StreetVendor from '../cyberpunk/StreetVendor'

interface CyberpunkSceneElementsProps {
  showBuildings: boolean
  showBillboards: boolean
  showFlyingVehicles: boolean
  showBridges: boolean
  showParticles: boolean
  showRain: boolean
  showNeonLines: boolean
}

export default function CyberpunkSceneElements({
  showBuildings,
  showBillboards,
  showFlyingVehicles,
  showBridges,
  showParticles,
  showRain,
  showNeonLines,
}: CyberpunkSceneElementsProps) {
  // Generate building data (shared by CyberpunkBuildings, HolographicBillboard, SkyBridge)
  const buildings = useMemo(() => generateBuildings(55, 15), [])
  const cityBuildings = useMemo(() => generateCityLayout(500), [])

  return (
    <>
      {/* Movie-grade cyberpunk city — 500+ InstancedMesh buildings */}
      {showBuildings && <CyberpunkCityInstanced count={500} />}
      {showBillboards && <HolographicBillboard buildings={cityBuildings} maxBillboards={300} />}

      {/* Sky bridges between buildings */}
      {showBridges && <SkyBridge buildings={buildings} maxBridges={25} maxDistance={20} />}

      {/* Flying vehicles and drones */}
      {showFlyingVehicles && (
        <>
          <FlyingVehicles />
          <FreightShip radius={80} height={45} speed={0.04} color="#0a84ff" size={1.0} />
          <FreightShip radius={90} height={50} speed={0.03} color="#ff375f" size={0.8} />
          <DroneSwarm count={8} radius={35} height={30} speed={0.08} color="#64d2ff" size={0.15} />
          <DroneSwarm count={6} radius={50} height={45} speed={0.06} color="#bf5af2" size={0.12} />
        </>
      )}

      {/* Cyberpunk rain */}
      {showRain && <CyberRain />}

      {/* Neon lights */}
      <NeonLights />

      {/* Multi-layer particle system: traffic trails / flying vehicle trails / dust */}
      {showParticles && <CyberpunkParticles trafficCount={500} trailCount={200} dustCount={800} />}

      {/* Steam vents */}
      <SteamVent position={[15, 0, 15]} color="#ffffff" particleCount={50} speed={1.0} height={3} />
      <SteamVent position={[-15, 0, -15]} color="#aaccff" particleCount={40} speed={0.8} height={2.5} />
      <SteamVent position={[0, 0, 20]} color="#ffffff" particleCount={45} speed={1.2} height={3.5} />

      {/* Smoke plumes */}
      <SmokePlume position={[25, 5, -10]} color="#4a4a6a" size={2.5} speed={0.3} opacity={0.08} />
      <SmokePlume position={[-20, 8, 15]} color="#3a3a5a" size={3.0} speed={0.25} opacity={0.06} />
      <SmokePlume position={[10, 12, -25]} color="#5a5a7a" size={2.0} speed={0.35} opacity={0.1} />

      {/* Pedestrian flow */}
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="east" position={[0, 0.1, 22]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="west" position={[0, 0.1, -22]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="north" position={[22, 0.1, 0]} />
      <PedestrianFlow roadLength={60} roadWidth={4} particleCount={100} speed={1.0} direction="south" position={[-22, 0.1, 0]} />

      {/* Vehicle traffic */}
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="east" position={[0, 0.15, 20]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="west" position={[0, 0.15, -20]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="north" position={[20, 0.15, 0]} />
      <VehicleTraffic roadLength={60} roadWidth={4} particleCount={50} speed={2.0} direction="south" position={[-20, 0.15, 0]} />

      {/* Street vendors */}
      <StreetVendor position={[8, 0, 8]} color="#ff9f0a" size={0.5} steamParticleCount={30} />
      <StreetVendor position={[-8, 0, -8]} color="#0a84ff" size={0.5} steamParticleCount={25} />
      <StreetVendor position={[0, 0, 12]} color="#30d158" size={0.5} steamParticleCount={28} />
      <StreetVendor position={[-12, 0, 0]} color="#bf5af2" size={0.5} steamParticleCount={32} />
      <StreetVendor position={[12, 0, -8]} color="#ff375f" size={0.5} steamParticleCount={27} />
    </>
  )
}
