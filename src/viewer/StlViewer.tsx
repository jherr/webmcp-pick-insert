/**
 * Three.js preview of the insert: tray, comb, and the pick overlay.
 *
 * The tray and comb arrive as two meshes rather than one so each can take its
 * own color, which is the whole point — those two colors are the two
 * filaments the 3MF asks the slicer for. They share coincident faces and no
 * volume, and the faces they share point away from each other, so back-face
 * culling settles every one of them and there is nothing to z-fight over.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useSelector } from '@tanstack/react-store'
import { designStore } from '@/store/design-store'
import type { PartColors } from '@/model/colors'

function parseStl(bytes: Uint8Array): THREE.BufferGeometry {
  const loader = new STLLoader()
  // STLLoader.parse can take an ArrayBuffer.
  const ab =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : (bytes.slice().buffer as ArrayBuffer)
  return loader.parse(ab)
}

function useStlGeometry(bytes: Uint8Array | null): THREE.BufferGeometry | null {
  const geometry = useMemo(() => {
    if (!bytes) return null
    try {
      const g = parseStl(bytes)
      g.computeVertexNormals()
      return g
    } catch (e) {
      console.error('[StlViewer] parse error', e)
      return null
    }
  }, [bytes])
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}

type Bounds = {
  center: THREE.Vector3
  radius: number
}

/**
 * Framing comes from the tray alone — it is the outer shell, so it bounds
 * everything else, and using it means neither the comb nor the pick overlay
 * can shunt the camera around as the design changes.
 */
function computeBounds(geometry: THREE.BufferGeometry): Bounds {
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const box = geometry.boundingBox ?? new THREE.Box3()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  box.getSize(size)
  box.getCenter(center)
  const radius =
    geometry.boundingSphere?.radius ?? Math.max(size.x, size.y, size.z) / 2
  return { center, radius }
}

function FitCamera({ bounds }: { bounds: Bounds | null }) {
  const { camera } = useThree()
  const lastRadius = useRef<number | null>(null)
  useEffect(() => {
    if (!bounds) return
    if (lastRadius.current === bounds.radius) return
    lastRadius.current = bounds.radius
    const r = Math.max(bounds.radius, 1)
    const distance = r * 2.6
    camera.position.set(distance, distance * 0.85, distance)
    camera.lookAt(0, 0, 0)
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.near = Math.max(r / 100, 0.01)
      camera.far = r * 100
      camera.updateProjectionMatrix()
    }
  }, [bounds, camera])
  return null
}

function Insert({
  trayGeometry,
  combGeometry,
  picksGeometry,
  bounds,
  colors,
}: {
  trayGeometry: THREE.BufferGeometry
  combGeometry: THREE.BufferGeometry | null
  picksGeometry: THREE.BufferGeometry | null
  bounds: Bounds
  colors: PartColors
}) {
  // Every mesh shares the tray's offset — they come out of OpenSCAD in the
  // same coordinates, and centring them separately would pull them apart.
  const offset = useMemo(
    () =>
      new THREE.Vector3(-bounds.center.x, -bounds.center.y, -bounds.center.z),
    [bounds.center.x, bounds.center.y, bounds.center.z],
  )

  // OpenSCAD models are Z-up and three.js is Y-up, so the insert arrives on
  // its back. Stand it on its base, the way it drops into the tin.
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <group position={offset}>
        <mesh geometry={trayGeometry} castShadow receiveShadow>
          <meshStandardMaterial
            color={colors.tray}
            metalness={0.05}
            roughness={0.45}
            flatShading
          />
        </mesh>
        {combGeometry ? (
          <mesh geometry={combGeometry} castShadow receiveShadow>
            <meshStandardMaterial
              color={colors.comb}
              metalness={0.05}
              roughness={0.45}
              flatShading
            />
          </mesh>
        ) : null}
        {/* See-through, so it stays obvious that the picks are not the print. */}
        {picksGeometry ? (
          <mesh geometry={picksGeometry} renderOrder={1}>
            <meshStandardMaterial
              color={colors.picks}
              metalness={0}
              roughness={0.35}
              flatShading
              transparent
              opacity={0.45}
              depthWrite={false}
            />
          </mesh>
        ) : null}
      </group>
    </group>
  )
}

function Scene({
  trayGeometry,
  combGeometry,
  picksGeometry,
  bounds,
  colors,
}: {
  trayGeometry: THREE.BufferGeometry | null
  combGeometry: THREE.BufferGeometry | null
  picksGeometry: THREE.BufferGeometry | null
  bounds: Bounds | null
  colors: PartColors
}) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 14]} intensity={1.05} />
      <directionalLight position={[-12, -6, -10]} intensity={0.35} />
      {trayGeometry && bounds ? (
        <Insert
          trayGeometry={trayGeometry}
          combGeometry={combGeometry}
          picksGeometry={picksGeometry}
          bounds={bounds}
          colors={colors}
        />
      ) : null}
      <FitCamera bounds={bounds} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  )
}

export function StlViewer({ className }: { className?: string }) {
  const trayStl = useSelector(designStore, (s) => s.render.trayStl)
  const combStl = useSelector(designStore, (s) => s.render.combStl)
  const picksStl = useSelector(designStore, (s) => s.render.picksStl)
  const colors = useSelector(designStore, (s) => s.colors)
  const trayGeometry = useStlGeometry(trayStl)
  const combGeometry = useStlGeometry(combStl)
  const picksGeometry = useStlGeometry(picksStl)
  const bounds = useMemo(
    () => (trayGeometry ? computeBounds(trayGeometry) : null),
    [trayGeometry],
  )

  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [80, 60, 80], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Scene
          trayGeometry={trayGeometry}
          combGeometry={combGeometry}
          picksGeometry={picksGeometry}
          bounds={bounds}
          colors={colors}
        />
      </Canvas>
    </div>
  )
}
