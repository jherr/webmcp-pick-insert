import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { useSelector } from '@tanstack/react-store'
import { designStore } from '@/store/design-store'

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
 * Framing comes from the insert alone, never the picks, so toggling the pick
 * overlay does not shunt the camera around.
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
  geometry,
  picksGeometry,
  bounds,
}: {
  geometry: THREE.BufferGeometry
  picksGeometry: THREE.BufferGeometry | null
  bounds: Bounds
}) {
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#4fb8b2',
        metalness: 0.05,
        roughness: 0.45,
        flatShading: true,
      }),
    [],
  )
  // The picks are a separate render overlaid on the insert: warm and
  // see-through so it is obvious which mesh is the thing you print.
  const picksMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#ffb35c',
        metalness: 0,
        roughness: 0.35,
        flatShading: true,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => picksMaterial.dispose(), [picksMaterial])

  // Both meshes share the insert's offset — they come out of OpenSCAD in the
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
        <mesh geometry={geometry} material={material} castShadow receiveShadow />
        {picksGeometry ? (
          <mesh
            geometry={picksGeometry}
            material={picksMaterial}
            renderOrder={1}
          />
        ) : null}
      </group>
    </group>
  )
}

function Scene({
  geometry,
  picksGeometry,
  bounds,
}: {
  geometry: THREE.BufferGeometry | null
  picksGeometry: THREE.BufferGeometry | null
  bounds: Bounds | null
}) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[10, 18, 14]} intensity={1.05} />
      <directionalLight position={[-12, -6, -10]} intensity={0.35} />
      {geometry && bounds ? (
        <Insert
          geometry={geometry}
          picksGeometry={picksGeometry}
          bounds={bounds}
        />
      ) : null}
      <FitCamera bounds={bounds} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  )
}

export function StlViewer({ className }: { className?: string }) {
  const stl = useSelector(designStore, (s) => s.render.stl)
  const picksStl = useSelector(designStore, (s) => s.render.picksStl)
  const geometry = useStlGeometry(stl)
  const picksGeometry = useStlGeometry(picksStl)
  const bounds = useMemo(
    () => (geometry ? computeBounds(geometry) : null),
    [geometry],
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
          geometry={geometry}
          picksGeometry={picksGeometry}
          bounds={bounds}
        />
      </Canvas>
    </div>
  )
}
