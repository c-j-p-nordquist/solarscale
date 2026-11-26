import * as THREE from 'three';
import {
  BODY_BY_ID,
  SOLAR_BODIES,
  SUN_RADIUS_KM,
  getScaleMetrics,
} from '../data/solarData';
import {
  createGlowTexture,
  createPlanetTexture,
  createRingTexture,
} from '../textures/planetTextures';
import type {
  BodyData,
  BodyId,
  MoonData,
  ProjectedLabel,
  ScaleMode,
  SceneCallbacks,
  VisualToggles,
} from '../types';
import { CameraController } from './CameraController';

interface MoonRuntime {
  data: MoonData;
  mesh: THREE.Mesh;
  orbitLine: THREE.LineLoop;
  angle: number;
}

interface BodyRuntime {
  data: BodyData;
  rootGroup: THREE.Group;
  scaleGroup: THREE.Group;
  tiltGroup: THREE.Group;
  spinGroup: THREE.Group;
  mesh: THREE.Mesh;
  cloudsMesh?: THREE.Mesh;
  atmosphereMesh?: THREE.Mesh;
  ringMesh?: THREE.Mesh;
  axisGroup: THREE.Group;
  moonsGroup: THREE.Group;
  moons: MoonRuntime[];
  locatorSprite: THREE.Sprite;
  compareRing?: THREE.Mesh;
  hitMesh: THREE.Mesh;
  orbitLine?: THREE.LineLoop;
  orbitAngle: number;
  currentRadius: number;
  currentOrbitRadius: number;
  prevWorldPos: THREE.Vector3;
}

const COMPARE_MAX_RADIUS = 12;

// Deterministic initial orbital angles so planets are nicely spread around the Sun on load
const INITIAL_ORBIT_ANGLES: Record<BodyId, number> = {
  sun: 0,
  mercury: 0.7,
  venus: 2.35,
  earth: 0.45,
  mars: 1.55,
  jupiter: 3.65,
  saturn: 5.25,
  uranus: 2.75,
  neptune: 4.45,
};

function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function createCircleLoop(
  segments: number,
  color: THREE.ColorRepresentation,
  opacity: number
): THREE.LineLoop {
  const positions = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    positions[i * 3] = Math.cos(theta);
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new THREE.LineLoop(geometry, material);
}

function createRadialRingGeometry(
  innerRadius: number,
  outerRadius: number,
  segments = 96
): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, segments, 1);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const span = Math.max(0.0001, outerRadius - innerRadius);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.hypot(x, y);
    const u = THREE.MathUtils.clamp((r - innerRadius) / span, 0, 1);
    uv.setXY(i, u, 0.5);
  }
  uv.needsUpdate = true;
  return geometry;
}

function createAtmosphereMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color('#5cb8ff') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPosition.xyz);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = 1.0 - max(0.0, dot(normalize(vNormal), normalize(vViewDir)));
        float intensity = pow(rim, 2.8) * 0.85;
        gl_FragColor = vec4(glowColor, intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  });
}

export class SolarScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraController: CameraController;

  private readonly sunLight: THREE.PointLight;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly compareKeyLight: THREE.DirectionalLight;
  private readonly compareRimLight: THREE.DirectionalLight;

  private readonly bodies = new Map<BodyId, BodyRuntime>();
  private readonly hitMeshes: THREE.Object3D[] = [];
  private readonly sunCoronaSprites: THREE.Sprite[] = [];
  private readonly asteroidBelt: THREE.InstancedMesh;
  private readonly asteroidSeeds: Array<{
    angle: number;
    t: number;
    yOffset: number;
    scale: THREE.Vector3;
    rot: THREE.Euler;
    speed: number;
  }> = [];

  private scaleMode: ScaleMode = 'explorer';
  private focusedBodyId: BodyId | null = null;
  private compareA: BodyId = 'sun';
  private compareB: BodyId = 'earth';
  private paused = false;
  private timeSpeed = 2; // simulated days per second
  private simDays = 0;
  private toggles: VisualToggles = {
    showOrbits: true,
    showLabels: true,
    showAxes: true,
    realisticLighting: false,
    showAsteroidBelt: true,
  };

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private isPointerDown = false;

  private readonly tempVecA = new THREE.Vector3();
  private readonly tempDelta = new THREE.Vector3();
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();

  private readonly resizeObserver: ResizeObserver;
  private rafId = 0;
  private lastTimestamp = 0;
  private elapsedSeconds = 0;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#030612');

    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.001, 60000);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.cameraController = new CameraController(this.camera, this.renderer.domElement);

    // Lighting
    this.sunLight = new THREE.PointLight(0xfff5e0, 2.8, 0, 0);
    this.sunLight.position.set(0, 0, 0);
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0xb8c8f0, 0.38);
    this.scene.add(this.ambientLight);

    // Dedicated studio key/rim lights active only in Compare mode so both worlds look crisp
    this.compareKeyLight = new THREE.DirectionalLight(0xfff8eb, 2.2);
    this.compareKeyLight.position.set(25, 16, 32);
    this.compareKeyLight.visible = false;
    this.scene.add(this.compareKeyLight);

    this.compareRimLight = new THREE.DirectionalLight(0x7aa8ff, 0.55);
    this.compareRimLight.position.set(-22, -10, -24);
    this.compareRimLight.visible = false;
    this.scene.add(this.compareRimLight);

    // Build deep-space starfield, celestial bodies, and asteroid belt
    this.buildStarfield();
    this.buildBodies();
    this.asteroidBelt = this.buildAsteroidBelt();
    this.scene.add(this.asteroidBelt);

    // Apply initial scale layout & camera framing
    this.applyScaleLayout();
    this.updateBodyPositions(0);
    this.applyInitialCamera();

    // Pointer picking (distinguishing click vs orbit drag)
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointerup', this.onPointerUp);

    // Responsive sizing
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.handleResize);

    // Start render loop
    this.lastTimestamp = performance.now();
    this.rafId = requestAnimationFrame(this.animate);
  }

  private buildStarfield(): void {
    const rand = createSeededRandom(42019);
    const totalStars = 3600;
    const positions = new Float32Array(totalStars * 3);
    const colors = new Float32Array(totalStars * 3);

    const starPalette = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#dbeafe'),
      new THREE.Color('#fef3c7'),
      new THREE.Color('#fed7aa'),
      new THREE.Color('#bfdbfe'),
      new THREE.Color('#e0e7ff'),
    ];

    const galacticTilt = new THREE.Euler(
      THREE.MathUtils.degToRad(28),
      THREE.MathUtils.degToRad(15),
      THREE.MathUtils.degToRad(-22)
    );
    const vec = new THREE.Vector3();

    for (let i = 0; i < totalStars; i++) {
      const isMilkyWay = i < totalStars * 0.38;
      const dist = 18000 + rand() * 14000;

      if (isMilkyWay) {
        const lon = rand() * Math.PI * 2;
        // Gaussian-like concentration near galactic equator
        const lat = (rand() + rand() + rand() - 1.5) * 0.28;
        vec.set(
          Math.cos(lat) * Math.cos(lon) * dist,
          Math.sin(lat) * dist,
          Math.cos(lat) * Math.sin(lon) * dist
        );
        vec.applyEuler(galacticTilt);
      } else {
        const u = rand() * 2 - 1;
        const theta = rand() * Math.PI * 2;
        const r = Math.sqrt(Math.max(0, 1 - u * u));
        vec.set(r * Math.cos(theta) * dist, u * dist, r * Math.sin(theta) * dist);
      }

      positions[i * 3] = vec.x;
      positions[i * 3 + 1] = vec.y;
      positions[i * 3 + 2] = vec.z;

      const baseColor = starPalette[Math.floor(rand() * starPalette.length)];
      const brightness = isMilkyWay ? 0.45 + rand() * 0.55 : 0.35 + rand() * 0.65;
      colors[i * 3] = baseColor.r * brightness;
      colors[i * 3 + 1] = baseColor.g * brightness;
      colors[i * 3 + 2] = baseColor.b * brightness;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starTexture = createGlowTexture('#ffffff');
    const material = new THREE.PointsMaterial({
      size: 2.8,
      sizeAttenuation: false,
      vertexColors: true,
      map: starTexture,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const stars = new THREE.Points(geometry, material);
    stars.frustumCulled = false;
    this.scene.add(stars);
  }

  private buildBodies(): void {
    const unitSphereGeo = new THREE.SphereGeometry(1, 52, 36);
    const cloudSphereGeo = new THREE.SphereGeometry(1.018, 44, 32);
    const atmoSphereGeo = new THREE.SphereGeometry(1.068, 40, 28);
    const hitSphereGeo = new THREE.SphereGeometry(1, 16, 12);
    const axisRodGeo = new THREE.CylinderGeometry(0.022, 0.022, 3.1, 10);
    const northTipGeo = new THREE.ConeGeometry(0.085, 0.24, 12);
    const southTipGeo = new THREE.SphereGeometry(0.055, 10, 8);
    const compareRingGeo = new THREE.RingGeometry(1.45, 1.8, 48);

    for (const data of SOLAR_BODIES) {
      const rootGroup = new THREE.Group();
      rootGroup.name = `body-${data.id}`;

      const scaleGroup = new THREE.Group();
      rootGroup.add(scaleGroup);

      // Axial tilt container: tilts the planet's spin axis by its true obliquity
      const tiltGroup = new THREE.Group();
      tiltGroup.rotation.z = THREE.MathUtils.degToRad(data.axialTiltDeg);
      scaleGroup.add(tiltGroup);

      const spinGroup = new THREE.Group();
      tiltGroup.add(spinGroup);

      const planetTexture = createPlanetTexture(data.id);
      const isSun = data.id === 'sun';

      const material = isSun
        ? new THREE.MeshBasicMaterial({ map: planetTexture })
        : new THREE.MeshStandardMaterial({
            map: planetTexture,
            roughness: data.type === 'terrestrial' ? 0.82 : 0.68,
            metalness: 0.04,
          });

      const mesh = new THREE.Mesh(unitSphereGeo, material);
      spinGroup.add(mesh);

      // Sun glowing corona sprites
      if (isSun) {
        const innerGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createGlowTexture('#ffae2b'),
            color: 0xffd27a,
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        innerGlow.scale.set(2.9, 2.9, 1);
        scaleGroup.add(innerGlow);
        this.sunCoronaSprites.push(innerGlow);

        const outerGlow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: createGlowTexture('#ff6a00'),
            color: 0xff8c24,
            transparent: true,
            opacity: 0.44,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        outerGlow.scale.set(5.4, 5.4, 1);
        scaleGroup.add(outerGlow);
        this.sunCoronaSprites.push(outerGlow);
      }

      // Earth cloud layer & atmospheric blue rim glow
      let cloudsMesh: THREE.Mesh | undefined;
      let atmosphereMesh: THREE.Mesh | undefined;
      if (data.id === 'earth') {
        const cloudMat = new THREE.MeshStandardMaterial({
          map: createPlanetTexture('earth-clouds'),
          transparent: true,
          opacity: 0.85,
          roughness: 0.9,
          metalness: 0,
          depthWrite: false,
        });
        cloudsMesh = new THREE.Mesh(cloudSphereGeo, cloudMat);
        tiltGroup.add(cloudsMesh);

        atmosphereMesh = new THREE.Mesh(atmoSphereGeo, createAtmosphereMaterial());
        tiltGroup.add(atmosphereMesh);
      }

      // Planetary rings (Saturn & Uranus)
      let ringMesh: THREE.Mesh | undefined;
      if (data.hasRings && data.ringInnerRatio && data.ringOuterRatio) {
        const ringGeo = createRadialRingGeometry(
          data.ringInnerRatio,
          data.ringOuterRatio,
          112
        );
        const ringTex = createRingTexture(data.id === 'saturn' ? 'saturn' : 'uranus');
        const ringMat = new THREE.MeshStandardMaterial({
          map: ringTex,
          transparent: true,
          opacity: data.id === 'saturn' ? 0.94 : 0.62,
          roughness: 0.8,
          metalness: 0.02,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        tiltGroup.add(ringMesh);
      }

      // Spin Axis Rod + North/South pole markers + subtle equatorial ring
      const axisGroup = new THREE.Group();
      const rodMat = new THREE.MeshBasicMaterial({
        color: isSun ? '#fde047' : '#7dd3fc',
        transparent: true,
        opacity: 0.9,
      });
      const rodMesh = new THREE.Mesh(axisRodGeo, rodMat);
      axisGroup.add(rodMesh);

      const northTip = new THREE.Mesh(
        northTipGeo,
        new THREE.MeshBasicMaterial({ color: '#fef08a' })
      );
      northTip.position.y = 1.62;
      axisGroup.add(northTip);

      const southTip = new THREE.Mesh(
        southTipGeo,
        new THREE.MeshBasicMaterial({ color: '#38bdf8' })
      );
      southTip.position.y = -1.56;
      axisGroup.add(southTip);

      const equatorRing = createCircleLoop(64, isSun ? '#fde047' : '#7dd3fc', 0.32);
      equatorRing.scale.setScalar(1.14);
      axisGroup.add(equatorRing);

      axisGroup.visible = this.toggles.showAxes;
      tiltGroup.add(axisGroup);

      // Moons container (Earth's Moon + Jupiter's 4 Galilean moons)
      const moonsGroup = new THREE.Group();
      const moons: MoonRuntime[] = [];
      if (data.moons && data.moons.length > 0) {
        data.moons.forEach((moonData, idx) => {
          const moonGeo = new THREE.SphereGeometry(1, 24, 18);
          const moonMat = new THREE.MeshStandardMaterial({
            map: createPlanetTexture(moonData.id),
            roughness: 0.9,
            metalness: 0.02,
          });
          const moonMesh = new THREE.Mesh(moonGeo, moonMat);
          moonsGroup.add(moonMesh);

          const moonOrbitLine = createCircleLoop(64, moonData.color, 0.28);
          moonsGroup.add(moonOrbitLine);

          moons.push({
            data: moonData,
            mesh: moonMesh,
            orbitLine: moonOrbitLine,
            angle: idx * 1.45 + 0.5,
          });
        });
      }
      rootGroup.add(moonsGroup);

      // Locator halo sprite (helps kids spot tiny planets in True Scale or Compare mode)
      const locatorSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: createGlowTexture(data.color),
          color: new THREE.Color(data.color),
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      locatorSprite.visible = false;
      rootGroup.add(locatorSprite);

      // Subtle glowing target ring for tiny planets in Compare mode
      const compareRing = new THREE.Mesh(
        compareRingGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(data.color),
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      compareRing.visible = false;
      rootGroup.add(compareRing);

      // Generous invisible raycast hit sphere
      const hitMesh = new THREE.Mesh(
        hitSphereGeo,
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.userData.bodyId = data.id;
      rootGroup.add(hitMesh);
      this.hitMeshes.push(hitMesh);

      // Planetary orbit path ring around the Sun
      let orbitLine: THREE.LineLoop | undefined;
      if (!isSun) {
        orbitLine = createCircleLoop(192, data.color, 0.34);
        orbitLine.rotation.x = THREE.MathUtils.degToRad(data.orbitalInclinationDeg);
        this.scene.add(orbitLine);
      }

      this.scene.add(rootGroup);

      this.bodies.set(data.id, {
        data,
        rootGroup,
        scaleGroup,
        tiltGroup,
        spinGroup,
        mesh,
        cloudsMesh,
        atmosphereMesh,
        ringMesh,
        axisGroup,
        moonsGroup,
        moons,
        locatorSprite,
        compareRing,
        hitMesh,
        orbitLine,
        orbitAngle: INITIAL_ORBIT_ANGLES[data.id],
        currentRadius: 1,
        currentOrbitRadius: 0,
        prevWorldPos: new THREE.Vector3(),
      });
    }
  }

  private buildAsteroidBelt(): THREE.InstancedMesh {
    const count = 900;
    const rand = createSeededRandom(88421);
    const geometry = new THREE.DodecahedronGeometry(1, 0);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.08,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const t = rand(); // 0..1 across belt width
      const yOffset = (rand() - 0.5) * 2.2;
      const baseScale = 0.06 + Math.pow(rand(), 2.2) * 0.22;
      const scale = new THREE.Vector3(
        baseScale * (0.7 + rand() * 0.7),
        baseScale * (0.6 + rand() * 0.7),
        baseScale * (0.7 + rand() * 0.7)
      );
      const rot = new THREE.Euler(
        rand() * Math.PI * 2,
        rand() * Math.PI * 2,
        rand() * Math.PI * 2
      );
      const speed = 0.022 + (1 - t) * 0.015;

      this.asteroidSeeds.push({ angle, t, yOffset, scale, rot, speed });

      const shade = 0.42 + rand() * 0.3;
      color.setRGB(shade * 1.04, shade * 0.96, shade * 0.88);
      mesh.setColorAt(i, color);
    }

    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }

    return mesh;
  }

  private updateAsteroidBelt(simDaysDelta: number): void {
    const showBelt =
      this.toggles.showAsteroidBelt &&
      (this.scaleMode === 'explorer' || this.scaleMode === 'true-size');
    this.asteroidBelt.visible = showBelt;
    if (!showBelt) return;

    const marsOrbit = getScaleMetrics(BODY_BY_ID.mars, this.scaleMode).orbitRadius;
    const jupiterOrbit = getScaleMetrics(BODY_BY_ID.jupiter, this.scaleMode).orbitRadius;
    const innerR = THREE.MathUtils.lerp(marsOrbit, jupiterOrbit, 0.28);
    const outerR = THREE.MathUtils.lerp(marsOrbit, jupiterOrbit, 0.72);
    const sizeMul = this.scaleMode === 'explorer' ? 1.0 : 0.78;

    for (let i = 0; i < this.asteroidSeeds.length; i++) {
      const seed = this.asteroidSeeds[i];
      if (!this.paused && simDaysDelta !== 0) {
        seed.angle += (simDaysDelta / 1600) * Math.PI * 2 * (0.75 + (1 - seed.t) * 0.5);
      }
      const r = THREE.MathUtils.lerp(innerR, outerR, seed.t);
      const x = Math.cos(seed.angle) * r;
      const z = Math.sin(seed.angle) * r;
      const y = seed.yOffset * sizeMul;

      this.tempVecA.set(x, y, z);
      this.tempQuat.setFromEuler(seed.rot);
      this.tempScale.copy(seed.scale).multiplyScalar(sizeMul);
      this.tempMatrix.compose(this.tempVecA, this.tempQuat, this.tempScale);
      this.asteroidBelt.setMatrixAt(i, this.tempMatrix);
    }
    this.asteroidBelt.instanceMatrix.needsUpdate = true;
  }

  private applyScaleLayout(): void {
    const isCompare = this.scaleMode === 'compare';

    // Toggle lighting setup for Compare mode vs orbital modes
    this.sunLight.visible = !isCompare;
    this.compareKeyLight.visible = isCompare;
    this.compareRimLight.visible = isCompare;
    this.updateLightingIntensity();

    if (isCompare) {
      this.layoutCompareBodies();
    } else {
      for (const runtime of this.bodies.values()) {
        const metrics = getScaleMetrics(runtime.data, this.scaleMode);
        runtime.currentRadius = metrics.radius;
        runtime.currentOrbitRadius = metrics.orbitRadius;
        runtime.rootGroup.visible = true;
        runtime.scaleGroup.scale.setScalar(runtime.currentRadius);
        runtime.moonsGroup.visible = runtime.moons.length > 0;
        if (runtime.compareRing) {
          runtime.compareRing.visible = false;
        }
        if (runtime.orbitLine) {
          runtime.orbitLine.visible = this.toggles.showOrbits;
          runtime.orbitLine.scale.setScalar(runtime.currentOrbitRadius);
          const lineMat = runtime.orbitLine.material as THREE.LineBasicMaterial;
          lineMat.opacity =
            runtime.data.id === this.focusedBodyId ? 0.78 : 0.34;
        }
        this.layoutMoons(runtime);
      }
    }

    this.updateAsteroidBelt(0);
  }

  private layoutCompareBodies(): void {
    const bodyA = BODY_BY_ID[this.compareA];
    const bodyB = BODY_BY_ID[this.compareB];
    const maxKm = Math.max(bodyA.radiusKm, bodyB.radiusKm);

    const radiusA = COMPARE_MAX_RADIUS * (bodyA.radiusKm / maxKm);
    const radiusB = COMPARE_MAX_RADIUS * (bodyB.radiusKm / maxKm);

    for (const runtime of this.bodies.values()) {
      const id = runtime.data.id;
      const visible = id === this.compareA || id === this.compareB;
      runtime.rootGroup.visible = visible;
      runtime.moonsGroup.visible = false;
      if (runtime.orbitLine) {
        runtime.orbitLine.visible = false;
      }
      if (runtime.compareRing) {
        runtime.compareRing.visible = false;
      }
    }

    const runtimeA = this.bodies.get(this.compareA)!;
    const runtimeB = this.bodies.get(this.compareB)!;

    if (this.compareA === this.compareB) {
      runtimeA.currentRadius = COMPARE_MAX_RADIUS;
      runtimeA.currentOrbitRadius = 0;
      runtimeA.scaleGroup.scale.setScalar(COMPARE_MAX_RADIUS);
      runtimeA.rootGroup.position.set(0, 0, 0);
      runtimeA.prevWorldPos.set(0, 0, 0);
      return;
    }

    const extA = radiusA * (bodyA.hasRings ? (bodyA.ringOuterRatio ?? 1) : 1);
    const extB = radiusB * (bodyB.hasRings ? (bodyB.ringOuterRatio ?? 1) : 1);
    const gap = Math.max(2.6, Math.min(4.8, (radiusA + radiusB) * 0.25));
    const totalSpan = extA * 2 + gap + extB * 2;
    const xA = -totalSpan / 2 + extA;
    const xB = totalSpan / 2 - extB;

    runtimeA.currentRadius = radiusA;
    runtimeA.currentOrbitRadius = 0;
    runtimeA.scaleGroup.scale.setScalar(radiusA);
    runtimeA.rootGroup.position.set(xA, 0, 0);
    runtimeA.prevWorldPos.set(xA, 0, 0);

    runtimeB.currentRadius = radiusB;
    runtimeB.currentOrbitRadius = 0;
    runtimeB.scaleGroup.scale.setScalar(radiusB);
    runtimeB.rootGroup.position.set(xB, 0, 0);
    runtimeB.prevWorldPos.set(xB, 0, 0);
  }

  private layoutMoons(runtime: BodyRuntime): void {
    if (runtime.moons.length === 0) return;

    const parentRadius = runtime.currentRadius;
    runtime.moons.forEach((moon, idx) => {
      let moonRadius: number;
      let moonOrbitRadius: number;

      if (this.scaleMode === 'true-scale') {
        moonRadius = moon.data.radiusKm / SUN_RADIUS_KM;
        moonOrbitRadius = moon.data.orbitRadiusKm / SUN_RADIUS_KM;
      } else if (this.scaleMode === 'true-size') {
        moonRadius = Math.max(
          parentRadius * (moon.data.radiusKm / runtime.data.radiusKm),
          0.025
        );
        moonOrbitRadius = parentRadius * (2.1 + idx * 0.72);
      } else {
        // Explorer mode: clearly visible moons around Earth & Jupiter
        moonRadius = Math.max(
          parentRadius * (moon.data.radiusKm / runtime.data.radiusKm) * 0.9,
          parentRadius * 0.14
        );
        moonOrbitRadius = parentRadius * (1.85 + idx * 0.58);
      }

      moon.mesh.scale.setScalar(moonRadius);
      moon.orbitLine.scale.setScalar(moonOrbitRadius);
      moon.orbitLine.visible = this.toggles.showOrbits;
      moon.mesh.position.set(
        Math.cos(moon.angle) * moonOrbitRadius,
        0,
        Math.sin(moon.angle) * moonOrbitRadius
      );
    });
  }

  private updateBodyPositions(simDaysDelta: number): void {
    const isCompare = this.scaleMode === 'compare';

    for (const runtime of this.bodies.values()) {
      const { data } = runtime;

      // Axial spin (runs in all modes including Compare so kids see true tilted spin!)
      if (!this.paused && simDaysDelta !== 0 && data.rotationPeriodHours !== 0) {
        const daysPerRotation = data.rotationPeriodHours / 24;
        // Clamp super-fast spins visually at high timeSpeed while preserving sign/direction
        const rawDeltaRot = (simDaysDelta / daysPerRotation) * Math.PI * 2;
        const clampedDeltaRot = THREE.MathUtils.clamp(rawDeltaRot, -0.32, 0.32);
        runtime.spinGroup.rotation.y += clampedDeltaRot;

        if (runtime.cloudsMesh) {
          runtime.cloudsMesh.rotation.y = runtime.spinGroup.rotation.y * 1.14;
        }
      }

      if (isCompare) {
        continue;
      }

      // Orbital motion
      if (data.orbitPeriodDays > 0) {
        if (!this.paused && simDaysDelta !== 0) {
          runtime.orbitAngle += (simDaysDelta / data.orbitPeriodDays) * Math.PI * 2;
        }
        const r = runtime.currentOrbitRadius;
        const incRad = THREE.MathUtils.degToRad(data.orbitalInclinationDeg);
        const flatX = Math.cos(runtime.orbitAngle) * r;
        const flatZ = Math.sin(runtime.orbitAngle) * r;
        const y = -flatZ * Math.sin(incRad);
        const z = flatZ * Math.cos(incRad);

        runtime.rootGroup.position.set(flatX, y, z);
      } else {
        runtime.rootGroup.position.set(0, 0, 0);
      }

      // Moons orbital motion
      if (runtime.moons.length > 0 && runtime.moonsGroup.visible) {
        for (const moon of runtime.moons) {
          if (!this.paused && simDaysDelta !== 0 && moon.data.orbitPeriodDays > 0) {
            moon.angle += (simDaysDelta / moon.data.orbitPeriodDays) * Math.PI * 2;
          }
          const orbitR = moon.orbitLine.scale.x;
          moon.mesh.position.set(
            Math.cos(moon.angle) * orbitR,
            0,
            Math.sin(moon.angle) * orbitR
          );
        }
      }
    }
  }

  private updateDynamicHelpers(): void {
    const isTrueScale = this.scaleMode === 'true-scale';
    const isCompare = this.scaleMode === 'compare';
    const pulse = 0.85 + 0.15 * Math.sin(this.elapsedSeconds * 3.2);

    // Subtle Sun corona breathing
    if (this.sunCoronaSprites.length >= 2) {
      this.sunCoronaSprites[0].scale.setScalar(2.85 + 0.12 * Math.sin(this.elapsedSeconds * 1.7));
      this.sunCoronaSprites[1].scale.setScalar(5.35 + 0.22 * Math.cos(this.elapsedSeconds * 1.1));
    }

    for (const runtime of this.bodies.values()) {
      if (!runtime.rootGroup.visible) continue;

      const camDist = this.camera.position.distanceTo(runtime.rootGroup.position);

      // Generous invisible raycast hit sphere so tiny planets are easy to click
      const minClickRadius = camDist * 0.028;
      const visualOuter =
        runtime.currentRadius *
        (runtime.data.hasRings ? (runtime.data.ringOuterRatio ?? 1.2) : 1.15);
      runtime.hitMesh.scale.setScalar(Math.max(visualOuter, minClickRadius));

      // Locator halo in True Scale mode (or for tiny planets in True Size when zoomed far out)
      const isTinyInCompare = isCompare && runtime.currentRadius < 0.6;
      const showLocator =
        (isTrueScale && runtime.data.id !== 'sun') ||
        (this.scaleMode === 'true-size' && runtime.currentRadius < 0.35 && camDist > 45) ||
        isTinyInCompare;

      if (showLocator) {
        const haloSize = isTinyInCompare
          ? Math.max(runtime.currentRadius * 5.0, camDist * 0.048) * pulse
          : Math.max(runtime.currentRadius * 4.0, camDist * 0.036);
        runtime.locatorSprite.visible = true;
        runtime.locatorSprite.scale.set(haloSize, haloSize, 1);
      } else {
        runtime.locatorSprite.visible = false;
      }

      // Crisp face-camera indicator ring around tiny bodies (< 0.6 units) in Compare mode
      if (runtime.compareRing) {
        if (isTinyInCompare) {
          runtime.compareRing.visible = true;
          const ringScale = Math.max(runtime.currentRadius * 2.4, camDist * 0.022) * pulse;
          runtime.compareRing.scale.setScalar(ringScale);
          runtime.compareRing.quaternion.copy(this.camera.quaternion);
        } else {
          runtime.compareRing.visible = false;
        }
      }
    }
  }

  private applyInitialCamera(): void {
    // Start with a welcoming Explorer view of the Solar System
    this.cameraController.setDistanceLimits(0.8, 1200);
    this.cameraController.setImmediate(
      new THREE.Vector3(0, 56, 122),
      new THREE.Vector3(0, 0, 0)
    );
  }

  private getFocusCameraFrame(bodyId: BodyId): {
    target: THREE.Vector3;
    position: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
  } {
    const runtime = this.bodies.get(bodyId)!;
    const pos = runtime.rootGroup.position.clone();
    const r = Math.max(runtime.currentRadius, 0.002);
    const outerMult = runtime.data.hasRings ? (runtime.data.ringOuterRatio ?? 2.2) : 1.0;
    const dist = r * (runtime.data.hasRings ? outerMult * 2.45 : 4.2);

    // Gentle elevated 3/4 view so axial tilt, rings, and day/night lighting look dramatic
    const dir = new THREE.Vector3(0.55, 0.34, 0.76).normalize();
    const camPos = pos.clone().addScaledVector(dir, dist);

    const maxDist =
      this.scaleMode === 'true-scale'
        ? 18000
        : this.scaleMode === 'compare'
        ? 240
        : 1200;

    return {
      target: pos,
      position: camPos,
      minDistance: Math.max(0.004, r * 1.38),
      maxDistance: maxDist,
    };
  }

  private frameCompareView(): void {
    const runtimeA = this.bodies.get(this.compareA)!;
    const runtimeB = this.bodies.get(this.compareB)!;

    const extA =
      runtimeA.currentRadius *
      (runtimeA.data.hasRings ? (runtimeA.data.ringOuterRatio ?? 1) : 1);
    const extB =
      runtimeB.currentRadius *
      (runtimeB.data.hasRings ? (runtimeB.data.ringOuterRatio ?? 1) : 1);

    const leftX = Math.min(runtimeA.rootGroup.position.x - extA, runtimeB.rootGroup.position.x - extB);
    const rightX = Math.max(runtimeA.rootGroup.position.x + extA, runtimeB.rootGroup.position.x + extB);
    const halfWidth = Math.max(COMPARE_MAX_RADIUS, (rightX - leftX) * 0.5);
    const halfHeight = Math.max(runtimeA.currentRadius, runtimeB.currentRadius);

    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const aspect = Math.max(0.5, this.camera.aspect);
    const distH = halfHeight / Math.tan(fovRad / 2);
    const distW = halfWidth / (Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distH, distW) * 1.32;

    const minR = Math.min(runtimeA.currentRadius, runtimeB.currentRadius);

    this.cameraController.flyTo(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, dist * 0.14, dist),
      {
        duration: 0.95,
        minDistance: Math.max(0.03, minR * 1.45),
        maxDistance: Math.max(180, dist * 4),
      }
    );
  }

  private updateLightingIntensity(): void {
    if (this.scaleMode === 'compare') {
      this.ambientLight.intensity = this.toggles.realisticLighting ? 0.12 : 0.42;
      this.compareKeyLight.intensity = this.toggles.realisticLighting ? 2.5 : 2.1;
    } else {
      this.ambientLight.intensity = this.toggles.realisticLighting ? 0.05 : 0.38;
      this.sunLight.intensity = this.toggles.realisticLighting ? 3.2 : 2.75;
    }
  }

  private projectLabels(): ProjectedLabel[] {
    const width = this.renderer.domElement.clientWidth || this.container.clientWidth;
    const height = this.renderer.domElement.clientHeight || this.container.clientHeight;
    const labels: ProjectedLabel[] = [];
    const isCompare = this.scaleMode === 'compare';

    for (const runtime of this.bodies.values()) {
      const { data } = runtime;
      const inMode =
        !isCompare || data.id === this.compareA || data.id === this.compareB;

      if (!inMode || !this.toggles.showLabels) {
        labels.push({
          id: data.id,
          name: data.name,
          x: -9999,
          y: -9999,
          visible: false,
          color: data.color,
          isSelected: this.focusedBodyId === data.id,
        });
        continue;
      }

      // Anchor label slightly above the planet's top pole
      const camDist = this.camera.position.distanceTo(runtime.rootGroup.position);
      const yOffset = Math.max(runtime.currentRadius * 1.28, camDist * 0.022);
      this.tempVecA.copy(runtime.rootGroup.position);
      this.tempVecA.y += yOffset;
      this.tempVecA.project(this.camera);

      const inFront = this.tempVecA.z >= -1 && this.tempVecA.z <= 1;
      const x = (this.tempVecA.x * 0.5 + 0.5) * width;
      const y = (-this.tempVecA.y * 0.5 + 0.5) * height;
      const onScreen =
        inFront && x >= -60 && x <= width + 60 && y >= -40 && y <= height + 40;

      let distanceLabel: string | undefined;
      if (this.scaleMode === 'true-scale' && data.distanceAu > 0) {
        distanceLabel = `${data.distanceAu.toFixed(data.distanceAu < 2 ? 2 : 1)} AU`;
      } else if (isCompare) {
        distanceLabel = `${Math.round(data.radiusKm * 2).toLocaleString('en-US')} km`;
      }

      labels.push({
        id: data.id,
        name: data.name,
        x,
        y,
        visible: onScreen,
        color: data.color,
        isSelected: this.focusedBodyId === data.id,
        distanceLabel,
      });
    }

    return labels;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.isPointerDown = true;
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const moveDist = Math.hypot(
      event.clientX - this.pointerDownPos.x,
      event.clientY - this.pointerDownPos.y
    );
    // Ignore orbit/pan drags
    if (moveDist > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const activeHits = this.hitMeshes.filter((m) => m.parent?.visible);
    const intersections = this.raycaster.intersectObjects(activeHits, false);

    if (intersections.length > 0) {
      const hitId = intersections[0].object.userData.bodyId as BodyId | undefined;
      if (hitId) {
        if (this.scaleMode === 'compare') {
          this.focusBody(hitId);
        }
        this.callbacks.onSelectBody(hitId);
      }
    }
  };

  private readonly handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private readonly animate = (timestamp: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedSeconds += dt;

    const simDaysDelta = this.paused ? 0 : dt * this.timeSpeed;
    this.simDays += simDaysDelta;

    // Record tracked body position before advancing orbits
    let trackedRuntime: BodyRuntime | undefined;
    if (this.scaleMode !== 'compare' && this.focusedBodyId) {
      trackedRuntime = this.bodies.get(this.focusedBodyId);
      if (trackedRuntime) {
        trackedRuntime.prevWorldPos.copy(trackedRuntime.rootGroup.position);
      }
    }

    this.updateBodyPositions(simDaysDelta);
    this.updateAsteroidBelt(simDaysDelta);

    // Apply per-frame orbital delta to camera & target so orbiting a moving planet is effortless
    if (trackedRuntime) {
      this.tempDelta.subVectors(
        trackedRuntime.rootGroup.position,
        trackedRuntime.prevWorldPos
      );
      this.cameraController.applyTargetDelta(this.tempDelta);
    }

    this.cameraController.update(dt);
    this.updateDynamicHelpers();

    this.renderer.render(this.scene, this.camera);

    const projected = this.projectLabels();
    this.callbacks.onFrame(projected, this.simDays);
  };

  // ==================== PUBLIC API ====================

  public setScaleMode(mode: ScaleMode): void {
    if (this.scaleMode === mode) return;
    this.scaleMode = mode;
    this.applyScaleLayout();
    this.updateBodyPositions(0);

    if (mode === 'compare') {
      this.frameCompareView();
    } else if (mode === 'true-scale') {
      if (this.focusedBodyId) {
        const frame = this.getFocusCameraFrame(this.focusedBodyId);
        this.cameraController.flyTo(frame.target, frame.position, {
          duration: 1.1,
          minDistance: frame.minDistance,
          maxDistance: frame.maxDistance,
        });
      } else {
        this.resetView();
      }
    } else {
      this.resetView();
    }
  }

  public focusBody(id: BodyId | null): void {
    this.focusedBodyId = id;

    // Highlight selected planet's orbit path
    if (this.scaleMode !== 'compare') {
      for (const runtime of this.bodies.values()) {
        if (runtime.orbitLine) {
          const lineMat = runtime.orbitLine.material as THREE.LineBasicMaterial;
          lineMat.opacity = runtime.data.id === id ? 0.78 : 0.34;
        }
      }
    }

    if (!id) {
      this.resetView();
      return;
    }

    const runtime = this.bodies.get(id);
    if (!runtime || !runtime.rootGroup.visible) return;

    const frame = this.getFocusCameraFrame(id);
    this.cameraController.flyTo(frame.target, frame.position, {
      duration: 1.0,
      minDistance: frame.minDistance,
      maxDistance: frame.maxDistance,
    });
  }

  public setCompareBodies(idA: BodyId, idB: BodyId): void {
    this.compareA = idA;
    this.compareB = idB;
    if (this.scaleMode === 'compare') {
      this.layoutCompareBodies();
      this.frameCompareView();
    }
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setTimeSpeed(daysPerSecond: number): void {
    this.timeSpeed = Math.max(0, daysPerSecond);
  }

  public setToggles(toggles: Partial<VisualToggles>): void {
    this.toggles = { ...this.toggles, ...toggles };

    const isCompare = this.scaleMode === 'compare';
    for (const runtime of this.bodies.values()) {
      runtime.axisGroup.visible = this.toggles.showAxes;
      if (runtime.orbitLine) {
        runtime.orbitLine.visible = !isCompare && this.toggles.showOrbits;
      }
      for (const moon of runtime.moons) {
        moon.orbitLine.visible = !isCompare && this.toggles.showOrbits;
      }
    }

    this.updateLightingIntensity();
    this.updateAsteroidBelt(0);
  }

  public resetView(): void {
    if (this.scaleMode === 'compare') {
      this.frameCompareView();
      return;
    }

    this.focusedBodyId = null;
    for (const runtime of this.bodies.values()) {
      if (runtime.orbitLine) {
        const lineMat = runtime.orbitLine.material as THREE.LineBasicMaterial;
        lineMat.opacity = 0.34;
      }
    }

    if (this.scaleMode === 'explorer') {
      this.cameraController.flyTo(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 56, 122),
        { duration: 1.0, minDistance: 0.8, maxDistance: 1200 }
      );
    } else if (this.scaleMode === 'true-size') {
      this.cameraController.flyTo(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 44, 118),
        { duration: 1.0, minDistance: 0.15, maxDistance: 1400 }
      );
    } else {
      // true-scale: frame the inner solar system so Sun + Earth's vast distance are visible
      this.cameraController.flyTo(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 140, 360),
        { duration: 1.1, minDistance: 0.004, maxDistance: 18000 }
      );
    }
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.handleResize);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointerup', this.onPointerUp);

    this.cameraController.dispose();

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat) mat.dispose();
        }
      } else if (obj instanceof THREE.Sprite) {
        obj.material.dispose();
      }
    });

    this.renderer.dispose();
    if (dom.parentElement) {
      dom.parentElement.removeChild(dom);
    }
  }
}
