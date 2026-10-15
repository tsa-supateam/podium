// Low-poly reactive audience (spec §4.4). Built from primitives with flat shading: no art assets,
// no network. Behaviour comes from audienceModel.ts; this file only turns states into poses.
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { countStates, makeAudience, stepAudience, type Avatar } from "../../lib/audienceModel";
import { live } from "../../stores/app";

const SKIN = ["#f1c7a5", "#d9a47c", "#b07850", "#8a5a3b", "#5e3b26", "#f5d6bf"];
const HAIR = ["#1d1510", "#3b2416", "#6b4a2b", "#a07a4f", "#2a2a2a", "#c9b38a"];
const SECTION_X = { L: -4.4, C: 0, R: 4.4 };

export const audienceStats = { counts: { engaged: 0, neutral: 0, bored: 0, confused: 0 } };

function seatPosition(a: Avatar): [number, number, number] {
  const x = SECTION_X[a.section] + (a.seat - 1) * 1.25;
  const z = -a.row * 1.7;
  const y = a.row * 0.45;
  return [x, y, z];
}

interface PoseRefs {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  notebook: THREE.Object3D;
  phone: THREE.Object3D;
  screen: THREE.MeshStandardMaterial;
  mouth: THREE.Object3D;
}

function Person({ a, refs }: { a: Avatar; refs: (r: PoseRefs) => void }) {
  const pos = seatPosition(a);
  const skin = SKIN[Math.floor(a.hue * 997) % SKIN.length];
  const hair = HAIR[Math.floor(a.hue * 7919) % HAIR.length];
  const shirt = new THREE.Color().setHSL(a.hue, 0.45, 0.45);
  const r = useRef<Partial<PoseRefs>>({});
  const done = () => {
    const x = r.current;
    if (x.root && x.torso && x.head && x.armL && x.armR && x.notebook && x.phone && x.screen && x.mouth) refs(x as PoseRefs);
  };
  const flat = { flatShading: true, roughness: 0.85 };
  return (
    <group position={pos} ref={(g) => { if (g) { r.current.root = g; done(); } }}>
      {/* chair */}
      <mesh position={[0, 0.45, -0.32]} castShadow>
        <boxGeometry args={[0.8, 0.9, 0.12]} />
        <meshStandardMaterial color="#2b303c" {...flat} />
      </mesh>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[0.8, 0.1, 0.7]} />
        <meshStandardMaterial color="#2b303c" {...flat} />
      </mesh>
      {/* legs */}
      <mesh position={[-0.15, 0.32, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.6, 6]} />
        <meshStandardMaterial color="#2c3446" {...flat} />
      </mesh>
      <mesh position={[0.15, 0.32, 0.3]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.6, 6]} />
        <meshStandardMaterial color="#2c3446" {...flat} />
      </mesh>
      <group position={[0, 0.32, -0.02]} ref={(g) => { if (g) { r.current.torso = g; done(); } }}>
        <mesh position={[0, 0.38, 0]} castShadow>
          <capsuleGeometry args={[0.24, 0.4, 3, 7]} />
          <meshStandardMaterial color={shirt} {...flat} />
        </mesh>
        <group position={[0, 0.88, 0.02]} ref={(g) => { if (g) { r.current.head = g; done(); } }}>
          <mesh castShadow>
            <icosahedronGeometry args={[0.2, 1]} />
            <meshStandardMaterial color={skin} {...flat} />
          </mesh>
          <mesh position={[0, 0.07, -0.03]} scale={[1.05, 0.7, 1.05]}>
            <icosahedronGeometry args={[0.2, 1]} />
            <meshStandardMaterial color={hair} {...flat} />
          </mesh>
          <mesh position={[-0.07, 0.02, 0.18]}>
            <sphereGeometry args={[0.025, 6, 4]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0.07, 0.02, 0.18]}>
            <sphereGeometry args={[0.025, 6, 4]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0, -0.08, 0.18]} ref={(m) => { if (m) { r.current.mouth = m; done(); } }}>
            <boxGeometry args={[0.07, 0.015, 0.01]} />
            <meshStandardMaterial color="#5a2a2a" />
          </mesh>
        </group>
        {/* arms pivot at the shoulders */}
        <group position={[-0.3, 0.62, 0]} ref={(g) => { if (g) { r.current.armL = g; done(); } }}>
          <mesh position={[0, -0.2, 0.08]} rotation={[0.5, 0, 0]}>
            <capsuleGeometry args={[0.07, 0.36, 2, 6]} />
            <meshStandardMaterial color={shirt} {...flat} />
          </mesh>
        </group>
        <group position={[0.3, 0.62, 0]} ref={(g) => { if (g) { r.current.armR = g; done(); } }}>
          <mesh position={[0, -0.2, 0.08]} rotation={[0.5, 0, 0]}>
            <capsuleGeometry args={[0.07, 0.36, 2, 6]} />
            <meshStandardMaterial color={shirt} {...flat} />
          </mesh>
        </group>
        {/* props */}
        <mesh position={[0, 0.2, 0.42]} rotation={[-1.1, 0, 0]} ref={(m) => { if (m) { r.current.notebook = m; done(); } }}>
          <boxGeometry args={[0.36, 0.26, 0.02]} />
          <meshStandardMaterial color="#e9e4d6" {...flat} />
        </mesh>
        <group position={[0.05, 0.42, 0.36]} rotation={[-0.5, 0, 0]} ref={(g) => { if (g) { r.current.phone = g; done(); } }}>
          <mesh>
            <boxGeometry args={[0.11, 0.2, 0.015]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0, 0, 0.009]}>
            <planeGeometry args={[0.095, 0.17]} />
            <meshStandardMaterial
              color="#7fd3ff"
              emissive="#7fd3ff"
              emissiveIntensity={1.5}
              ref={(m) => { if (m) { r.current.screen = m; done(); } }}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

function Crowd({ size, demo }: { size: number; demo: boolean }) {
  const avatars = useMemo(() => makeAudience(size, 7), [size]);
  const poses = useRef<Map<number, PoseRefs>>(new Map());
  const speaker = new THREE.Vector3(0, 1.6, 5.6);
  const tmp = new THREE.Vector3();
  const clock = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    clock.current += dt;
    const t = clock.current;
    let B = 0.3, zone = {}, burst = false;
    if (demo) {
      B = 0.5 + 0.35 * Math.sin(t / 5);
      zone = { L: 0.33 + 0.25 * Math.sin(t / 3), C: 0.34, R: 0.33 - 0.25 * Math.sin(t / 3) };
    } else if (live.tick) {
      B = live.tick.B;
      zone = live.tick.zoneShare;
      burst = live.tick.fillerBurst;
    }
    stepAudience(avatars, dt, B, zone, burst);
    audienceStats.counts = countStates(avatars);

    for (const a of avatars) {
      const p = poses.current.get(a.id);
      if (!p) continue;
      const ph = a.phase;
      // where the speaker is, relative to this avatar
      p.root.getWorldPosition(tmp);
      const toSpeakerYaw = Math.atan2(speaker.x - tmp.x, speaker.z - tmp.z);
      let lean = 0, sink = 0, headX = 0, headY = toSpeakerYaw, headZ = 0;
      let armLx = 0.2, armRx = 0.2, notebook = false, phone = false, mouthOpen = 0;
      const wob = Math.sin(t * 0.7 + ph) * 0.03;
      switch (a.state) {
        case "engaged": {
          lean = 0.22;
          headX = -0.05 + (Math.sin(t * 5 + ph) > 0.85 ? 0.18 : 0); // occasional nod
          notebook = a.id % 2 === 0;
          if (notebook) {
            armRx = 0.9 + Math.sin(t * 9 + ph) * 0.08; // writing
            armLx = 0.8;
            headX = 0.25 + (Math.sin(t * 0.8 + ph) > 0.4 ? -0.35 : 0); // glance between notes and speaker
          }
          break;
        }
        case "neutral":
          lean = 0.02 + wob;
          headY = toSpeakerYaw + Math.sin(t * 0.3 + ph) * 0.15;
          break;
        case "bored": {
          lean = -0.22;
          sink = -0.06;
          const mode = Math.floor((t / 9 + ph) % 3);
          if (mode === 0) {
            phone = true;
            headX = 0.55;
            headY = 0;
            armLx = armRx = 1.1;
          } else if (mode === 1) {
            headY = toSpeakerYaw + (a.id % 2 ? 1.0 : -1.0); // looking away
            headX = 0.1;
          } else {
            headX = -0.25; // head back, yawning
            mouthOpen = Math.max(0, Math.sin(t * 0.9 + ph)) * 4;
            armRx = 2.2;
          }
          break;
        }
        case "confused":
          headZ = 0.3 * Math.sign(Math.sin(ph) || 1);
          headY = toSpeakerYaw;
          armRx = 1.8; // hand to chin
          break;
      }
      p.torso.rotation.x = damp(p.torso.rotation.x, lean, 3, dt);
      p.torso.position.y = damp(p.torso.position.y, 0.32 + sink, 3, dt);
      p.head.rotation.x = damp(p.head.rotation.x, headX, 5, dt);
      p.head.rotation.y = damp(p.head.rotation.y, headY - p.root.rotation.y, 4, dt);
      p.head.rotation.z = damp(p.head.rotation.z, headZ, 4, dt);
      p.armL.rotation.x = damp(p.armL.rotation.x, armLx, 5, dt);
      p.armR.rotation.x = damp(p.armR.rotation.x, armRx, 6, dt);
      p.notebook.visible = notebook;
      p.phone.visible = phone;
      p.screen.emissiveIntensity = phone ? 1.4 + Math.sin(t * 3 + ph) * 0.3 : 0;
      p.mouth.scale.y = damp(p.mouth.scale.y, 1 + mouthOpen, 6, dt);
    }
  });

  return (
    <group>
      {avatars.map((a) => (
        <Person key={a.id} a={a} refs={(r) => poses.current.set(a.id, r)} />
      ))}
    </group>
  );
}

function Room() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#141822" roughness={1} />
      </mesh>
      {/* tiers */}
      {[1, 2, 3].map((r) => (
        <mesh key={r} position={[0, r * 0.45 - 0.22, -r * 1.7]} receiveShadow>
          <boxGeometry args={[16, 0.45, 1.7]} />
          <meshStandardMaterial color="#181c27" flatShading />
        </mesh>
      ))}
      <mesh position={[0, 4, -9]}>
        <planeGeometry args={[40, 12]} />
        <meshStandardMaterial color="#0f121a" />
      </mesh>
    </group>
  );
}

export default function AudienceScene({ size = 15, demo = false }: { size?: number; demo?: boolean }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [0, 2.2, 5.6], fov: 52, near: 0.1, far: 60 }}
      onCreated={({ camera }) => camera.lookAt(0, 1.25, -1.8)}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#07080c"]} />
      <fog attach="fog" args={["#07080c", 10, 24]} />
      <hemisphereLight args={["#c7d2ff", "#2a2010", 1.1]} />
      <directionalLight position={[3, 8, 6]} intensity={1.6} color="#ffe2b0" castShadow shadow-mapSize={[1024, 1024]} />
      <pointLight position={[0, 3, 3.5]} intensity={18} distance={16} color="#f5b14c" />
      <Room />
      <Crowd size={size} demo={demo} />
    </Canvas>
  );
}
