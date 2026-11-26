import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Deterministic Seeded PRNG & Fast 3D Seamless Sphere Noise
// ---------------------------------------------------------------------------

function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class ValueNoise3D {
  private perm: Uint8Array;
  private vals: Float32Array;

  constructor(seed: number) {
    const rng = createRng(seed);
    this.perm = new Uint8Array(512);
    this.vals = new Float32Array(256);

    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      p[i] = i;
      this.vals[i] = rng();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  sample(x: number, y: number, z: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);

    const xf = x - xi;
    const yf = y - yi;
    const zf = z - zi;

    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const w = zf * zf * (3 - 2 * zf);

    const X = xi & 255;
    const Y = yi & 255;
    const Z = zi & 255;

    const perm = this.perm;
    const vals = this.vals;

    const a = perm[X] + Y;
    const aa = perm[a & 255] + Z;
    const ab = perm[(a + 1) & 255] + Z;
    const b = perm[(X + 1) & 255] + Y;
    const ba = perm[b & 255] + Z;
    const bb = perm[(b + 1) & 255] + Z;

    const x00 = vals[perm[aa & 255]] + u * (vals[perm[ba & 255]] - vals[perm[aa & 255]]);
    const x10 = vals[perm[ab & 255]] + u * (vals[perm[bb & 255]] - vals[perm[ab & 255]]);
    const x01 =
      vals[perm[(aa + 1) & 255]] +
      u * (vals[perm[(ba + 1) & 255]] - vals[perm[(aa + 1) & 255]]);
    const x11 =
      vals[perm[(ab + 1) & 255]] +
      u * (vals[perm[(bb + 1) & 255]] - vals[perm[(ab + 1) & 255]]);

    const y0 = x00 + v * (x10 - x00);
    const y1 = x01 + v * (x11 - x01);
    return y0 + w * (y1 - y0);
  }

  fbm(x: number, y: number, z: number, octaves = 5, lacunarity = 2.05, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.sample(x * freq, y * freq, z * freq);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / norm;
  }

  ridged(x: number, y: number, z: number, octaves = 4): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = this.sample(x * freq, y * freq, z * freq);
      const r = 1 - Math.abs(n * 2 - 1);
      sum += amp * r * r;
      norm += amp;
      freq *= 2.1;
      amp *= 0.5;
    }
    return sum / norm;
  }
}

// ---------------------------------------------------------------------------
// Color Utilities
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(c1: RGB, c2: RGB, t: number): RGB {
  const k = clamp(t, 0, 1);
  return [
    c1[0] + (c2[0] - c1[0]) * k,
    c1[1] + (c2[1] - c1[1]) * k,
    c1[2] + (c2[2] - c1[2]) * k,
  ];
}

function sampleRamp(stops: Array<[number, RGB]>, t: number): RGB {
  const x = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (x <= t1) {
      const f = t1 === t0 ? 0 : (x - t0) / (t1 - t0);
      return lerpRGB(c0, c1, f);
    }
  }
  return stops[stops.length - 1][1];
}

function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((ch) => ch + ch)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [255, 220, 136];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context for procedural texture');
  }
  return { canvas, ctx };
}

function finalizePlanetTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

// ---------------------------------------------------------------------------
// Spherical Pixel Iteration Helper
// ---------------------------------------------------------------------------

function fillSphericalTexture(
  width: number,
  height: number,
  shader: (
    nx: number,
    ny: number,
    nz: number,
    lon: number,
    lat: number,
    u: number,
    v: number
  ) => [number, number, number, number]
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const { canvas, ctx } = createCanvas(width, height);
  const img = ctx.createImageData(width, height);
  const data = img.data;

  const twoPi = Math.PI * 2;
  const halfPi = Math.PI * 0.5;

  // Precompute cos/sin of longitude for speed
  const cosLon = new Float32Array(width);
  const sinLon = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const lon = (x / width) * twoPi;
    cosLon[x] = Math.cos(lon);
    sinLon[x] = Math.sin(lon);
  }

  let idx = 0;
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height;
    const lat = halfPi - v * Math.PI; // +pi/2 at north pole, -pi/2 at south pole
    const cosLat = Math.cos(lat);
    const ny = Math.sin(lat);

    for (let x = 0; x < width; x++) {
      const u = x / width;
      const lon = u * twoPi;
      const nx = cosLon[x] * cosLat;
      const nz = sinLon[x] * cosLat;

      const [r, g, b, a] = shader(nx, ny, nz, lon, lat, u, v);
      data[idx++] = r < 0 ? 0 : r > 255 ? 255 : r | 0;
      data[idx++] = g < 0 ? 0 : g > 255 ? 255 : g | 0;
      data[idx++] = b < 0 ? 0 : b > 255 ? 255 : b | 0;
      data[idx++] = a < 0 ? 0 : a > 255 ? 255 : a | 0;
    }
  }

  ctx.putImageData(img, 0, 0);
  return { canvas, ctx };
}

// ---------------------------------------------------------------------------
// Crater Drawing Helper (Equirectangular-compensated & Horizontally Wrapped)
// ---------------------------------------------------------------------------

interface CraterOptions {
  count: number;
  minRadius: number;
  maxRadius: number;
  bowlColor: string;
  rimColor: string;
  rayCount?: number;
  rayColor?: string;
  opacity?: number;
}

function drawCraters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rng: () => number,
  opts: CraterOptions
): void {
  const {
    count,
    minRadius,
    maxRadius,
    bowlColor,
    rimColor,
    rayCount = 0,
    rayColor = 'rgba(235, 232, 224, 0.25)',
    opacity = 0.85,
  } = opts;

  ctx.save();

  for (let i = 0; i < count; i++) {
    // Power-law distribution: many small craters, few large basins
    const sizeBias = Math.pow(rng(), 2.4);
    const r = lerp(minRadius, maxRadius, sizeBias);
    const cx = rng() * width;
    // Avoid extreme polar distortion
    const cy = lerp(height * 0.08, height * 0.92, rng());
    const lat = (0.5 - cy / height) * Math.PI;
    const rx = r / Math.max(0.28, Math.cos(lat));
    const ry = r;

    const hasRays = i < rayCount;

    // Draw wrapped copies so craters never clip at the seam
    for (const offsetX of [-width, 0, width]) {
      const x = cx + offsetX;
      if (x + rx * 4 < 0 || x - rx * 4 > width) continue;

      if (hasRays) {
        const spokes = 7 + Math.floor(rng() * 6);
        ctx.save();
        ctx.translate(x, cy);
        ctx.scale(rx / ry, 1);
        for (let s = 0; s < spokes; s++) {
          const angle = (s / spokes) * Math.PI * 2 + (rng() - 0.5) * 0.4;
          const len = ry * (2.2 + rng() * 3.0);
          const grad = ctx.createLinearGradient(0, 0, Math.cos(angle) * len, Math.sin(angle) * len);
          grad.addColorStop(0, rayColor);
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = Math.max(0.8, ry * 0.16);
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * ry * 0.8, Math.sin(angle) * ry * 0.8);
          ctx.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Outer subtle bright ejecta rim
      ctx.save();
      ctx.translate(x, cy);
      ctx.scale(rx / ry, 1);
      ctx.globalAlpha = opacity * (0.45 + 0.4 * rng());

      const rimGrad = ctx.createRadialGradient(0, 0, ry * 0.72, 0, 0, ry * 1.24);
      rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
      rimGrad.addColorStop(0.5, rimColor);
      rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rimGrad;
      ctx.beginPath();
      ctx.arc(0, 0, ry * 1.24, 0, Math.PI * 2);
      ctx.fill();

      // Crater bowl with directional inner shadow
      const bowlGrad = ctx.createRadialGradient(-ry * 0.22, -ry * 0.22, ry * 0.08, 0, 0, ry);
      bowlGrad.addColorStop(0, bowlColor);
      bowlGrad.addColorStop(0.75, bowlColor);
      bowlGrad.addColorStop(1, rimColor);
      ctx.fillStyle = bowlGrad;
      ctx.beginPath();
      ctx.arc(0, 0, ry * 0.92, 0, Math.PI * 2);
      ctx.fill();

      // Subtle central peak for large craters
      if (ry > maxRadius * 0.5) {
        ctx.fillStyle = rimColor;
        ctx.globalAlpha = opacity * 0.45;
        ctx.beginPath();
        ctx.arc(0, 0, ry * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Individual Celestial Body Texture Generators
// ---------------------------------------------------------------------------

function generateSunTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('sun-plasma-a'));
  const noiseB = new ValueNoise3D(hashString('sun-plasma-b'));
  const rng = createRng(hashString('sun-spots'));

  // Deterministic sunspot active regions near +/- 12 to 28 deg latitude
  const spots: Array<{ x: number; y: number; z: number; r: number }> = [];
  for (let i = 0; i < 9; i++) {
    const lon = rng() * Math.PI * 2;
    const lat = (rng() < 0.5 ? 1 : -1) * lerp(0.16, 0.5, rng());
    const cl = Math.cos(lat);
    spots.push({
      x: Math.cos(lon) * cl,
      y: Math.sin(lat),
      z: Math.sin(lon) * cl,
      r: lerp(0.045, 0.095, rng()),
    });
  }

  const ramp: Array<[number, RGB]> = [
    [0.0, [145, 22, 0]],
    [0.24, [215, 68, 4]],
    [0.5, [248, 134, 14]],
    [0.74, [255, 200, 58]],
    [0.9, [255, 238, 150]],
    [1.0, [255, 252, 228]],
  ];

  const { canvas } = fillSphericalTexture(1024, 512, (nx, ny, nz) => {
    // Domain-warped boiling convection granulation
    const wx = noiseB.fbm(nx * 3.5, ny * 3.5, nz * 3.5, 3) - 0.5;
    const wy = noiseB.fbm(nx * 3.5 + 11.2, ny * 3.5 + 4.7, nz * 3.5, 3) - 0.5;
    const wz = noiseB.fbm(nx * 3.5 + 2.3, ny * 3.5 + 17.1, nz * 3.5, 3) - 0.5;

    const px = nx * 5.2 + wx * 1.4;
    const py = ny * 5.2 + wy * 1.4;
    const pz = nz * 5.2 + wz * 1.4;

    const base = noiseA.fbm(px, py, pz, 5);
    const cells = noiseB.ridged(nx * 14 + wx * 2.1, ny * 14 + wy * 2.1, nz * 14 + wz * 2.1, 3);

    let energy = clamp(base * 0.65 + cells * 0.45 - 0.06, 0, 1);

    // Sunspots + bright faculae halo
    let spotDarken = 0;
    let faculaeBoost = 0;
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const dx = nx - s.x;
      const dy = ny - s.y;
      const dz = nz - s.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < s.r * 2.6) {
        const umbra = 1 - smoothstep(s.r * 0.25, s.r * 0.85, dist + wx * 0.03);
        const fac =
          smoothstep(s.r * 0.7, s.r * 1.3, dist) * (1 - smoothstep(s.r * 1.3, s.r * 2.5, dist));
        spotDarken = Math.max(spotDarken, umbra);
        faculaeBoost = Math.max(faculaeBoost, fac);
      }
    }

    energy = clamp(energy + faculaeBoost * 0.32, 0, 1);
    let rgb = sampleRamp(ramp, energy);

    if (spotDarken > 0.01) {
      const umbraColor: RGB = [42, 8, 2];
      rgb = lerpRGB(rgb, umbraColor, spotDarken * 0.88);
    }

    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateMercuryTexture(): THREE.CanvasTexture {
  const noise = new ValueNoise3D(hashString('mercury-surface'));
  const detail = new ValueNoise3D(hashString('mercury-detail'));
  const rng = createRng(hashString('mercury-craters'));

  const ramp: Array<[number, RGB]> = [
    [0.0, [74, 68, 63]],
    [0.35, [112, 105, 97]],
    [0.65, [145, 138, 129]],
    [1.0, [180, 173, 163]],
  ];

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const basin = noise.fbm(nx * 2.4, ny * 2.4, nz * 2.4, 4);
    const grit = detail.fbm(nx * 13, ny * 13, nz * 13, 4);
    const val = clamp(basin * 0.68 + grit * 0.38 - 0.04, 0, 1);
    const rgb = sampleRamp(ramp, val);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  drawCraters(ctx, 512, 256, rng, {
    count: 95,
    minRadius: 2.2,
    maxRadius: 22,
    bowlColor: 'rgba(66, 61, 56, 0.72)',
    rimColor: 'rgba(205, 198, 186, 0.65)',
    rayCount: 7,
    rayColor: 'rgba(222, 216, 206, 0.28)',
    opacity: 0.9,
  });

  return finalizePlanetTexture(canvas);
}

function generateVenusTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('venus-clouds-a'));
  const noiseB = new ValueNoise3D(hashString('venus-clouds-b'));

  const ramp: Array<[number, RGB]> = [
    [0.0, [166, 118, 52]],
    [0.3, [204, 158, 84]],
    [0.62, [232, 196, 126]],
    [0.88, [246, 224, 172]],
    [1.0, [252, 240, 204]],
  ];

  const { canvas } = fillSphericalTexture(512, 256, (nx, ny, nz, lon, lat) => {
    // Super-rotating chevron cloud bands
    const chevron = Math.cos(lon + Math.abs(lat) * 2.2) * 0.14;
    const swirl = noiseB.fbm(nx * 3.0, ny * 5.0, nz * 3.0, 4) - 0.5;
    const bandCoord = ny * 7.5 + swirl * 2.1 + chevron;
    const bands = Math.sin(bandCoord * Math.PI) * 0.5 + 0.5;
    const wisps = noiseA.fbm(nx * 5.0 + swirl * 1.4, ny * 9.0, nz * 5.0 + swirl * 1.4, 5);
    const polarBright = smoothstep(0.65, 0.98, Math.abs(ny)) * 0.14;
    const val = clamp(bands * 0.42 + wisps * 0.58 + polarBright, 0, 1);
    const rgb = sampleRamp(ramp, val);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateEarthTexture(): THREE.CanvasTexture {
  const noiseLand = new ValueNoise3D(hashString('earth-land'));
  const noiseDetail = new ValueNoise3D(hashString('earth-detail'));
  const noiseBiome = new ValueNoise3D(hashString('earth-biome'));

  // Stylized recognizable continent centers in (lonRad [-pi, pi], latRad [-pi/2, pi/2], rx, ry, weight)
  const continents: Array<[number, number, number, number, number]> = [
    // North America
    [-1.78, 0.78, 0.62, 0.38, 1.0],
    [-1.65, 0.42, 0.34, 0.24, 0.85],
    [-2.25, 1.05, 0.36, 0.2, 0.8],
    // Greenland
    [-0.75, 1.24, 0.25, 0.16, 0.85],
    // South America
    [-1.08, -0.22, 0.34, 0.34, 1.0],
    [-1.15, -0.64, 0.22, 0.32, 0.92],
    // Europe
    [0.24, 0.86, 0.38, 0.22, 0.88],
    [0.42, 1.08, 0.28, 0.16, 0.8],
    // Africa
    [0.32, 0.22, 0.44, 0.34, 1.05],
    [0.44, -0.26, 0.28, 0.36, 0.95],
    // Asia
    [1.38, 0.86, 0.88, 0.38, 1.05],
    [1.82, 0.54, 0.52, 0.3, 0.98],
    [1.34, 0.34, 0.24, 0.24, 0.86], // India
    [0.78, 0.42, 0.22, 0.2, 0.82], // Arabia
    [2.05, 0.08, 0.28, 0.16, 0.7], // SE Asia / islands
    // Australia
    [2.34, -0.44, 0.34, 0.22, 0.95],
  ];

  const { canvas } = fillSphericalTexture(1024, 512, (nx, ny, nz, lon, lat) => {
    // Wrap lon to [-pi, pi]
    const lonWrapped = lon > Math.PI ? lon - Math.PI * 2 : lon;
    const absLat = Math.abs(lat);

    // Evaluate continent field
    let continentField = 0;
    for (let i = 0; i < continents.length; i++) {
      const [cLon, cLat, rx, ry, w] = continents[i];
      let dLon = lonWrapped - cLon;
      if (dLon > Math.PI) dLon -= Math.PI * 2;
      if (dLon < -Math.PI) dLon += Math.PI * 2;
      const dLat = lat - cLat;
      const d2 = (dLon * dLon) / (rx * rx) + (dLat * dLat) / (ry * ry);
      if (d2 < 3.2) {
        continentField = Math.max(continentField, w * Math.exp(-d2 * 1.15));
      }
    }

    const coastNoise = noiseLand.fbm(nx * 4.2, ny * 4.2, nz * 4.2, 5);
    const fineNoise = noiseDetail.fbm(nx * 14, ny * 14, nz * 14, 4);
    const elevation = continentField + (coastNoise - 0.5) * 0.55 + (fineNoise - 0.5) * 0.12;

    // Polar ice caps (Antarctica + Arctic ice)
    const iceEdgeNoise = (coastNoise - 0.5) * 0.14;
    const isSouthCap = lat < -1.18 + iceEdgeNoise;
    const isNorthCap = lat > 1.32 + iceEdgeNoise;
    if (isSouthCap || isNorthCap) {
      const shade = 228 + fineNoise * 24;
      return [shade, shade + 3, Math.min(255, shade + 8), 255];
    }

    const seaLevel = 0.44;
    if (elevation < seaLevel) {
      // Ocean with deep abyssal blue and bright turquoise coastal shelf
      const depth = clamp((seaLevel - elevation) / 0.45, 0, 1);
      const shelf = 1 - smoothstep(0.0, 0.12, depth);
      const deepColor: RGB = [7, 32, 78];
      const midOcean: RGB = [14, 68, 134];
      const coastal: RGB = [28, 134, 168];
      let water = lerpRGB(midOcean, deepColor, smoothstep(0.1, 0.9, depth));
      water = lerpRGB(water, coastal, shelf * 0.82);
      // Subtle ocean variation
      const shimmer = (fineNoise - 0.5) * 10;
      return [water[0] + shimmer, water[1] + shimmer, water[2] + shimmer, 255];
    }

    // Land biomes
    const landHeight = clamp((elevation - seaLevel) / 0.65, 0, 1);
    const moisture = noiseBiome.fbm(nx * 3.5 + 4.1, ny * 3.5, nz * 3.5 + 2.7, 4);

    // Desert belt around 15°–32° latitude (0.26–0.56 rad)
    const desertBelt = Math.exp(-Math.pow((absLat - 0.4) / 0.24, 2));
    const aridity = clamp(desertBelt * 0.85 + (1 - moisture) * 0.55 - 0.2, 0, 1);

    const tropicalGreen: RGB = [32, 96, 40];
    const temperateGreen: RGB = [66, 124, 56];
    const savanna: RGB = [138, 146, 68];
    const desert: RGB = [208, 178, 114];
    const mountain: RGB = [126, 114, 98];
    const snowPeak: RGB = [232, 238, 244];

    let land = lerpRGB(tropicalGreen, temperateGreen, smoothstep(0.25, 0.85, absLat));
    land = lerpRGB(land, savanna, smoothstep(0.32, 0.6, aridity));
    land = lerpRGB(land, desert, smoothstep(0.54, 0.86, aridity));

    // Boreal / tundra darkening near high northern latitudes
    if (absLat > 0.92) {
      const tundra: RGB = [110, 122, 98];
      land = lerpRGB(land, tundra, smoothstep(0.92, 1.24, absLat));
    }

    // Mountain ridges & alpine snow
    const ridge = noiseDetail.ridged(nx * 9.5, ny * 9.5, nz * 9.5, 4);
    const mtnFactor = smoothstep(0.42, 0.8, landHeight * 0.75 + ridge * 0.45);
    land = lerpRGB(land, mountain, mtnFactor * 0.82);
    const snowFactor = smoothstep(0.76, 0.94, landHeight * 0.7 + ridge * 0.48);
    land = lerpRGB(land, snowPeak, snowFactor * 0.85);

    const micro = (fineNoise - 0.5) * 16;
    return [land[0] + micro, land[1] + micro, land[2] + micro, 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateEarthCloudsTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('earth-clouds-a'));
  const noiseB = new ValueNoise3D(hashString('earth-clouds-b'));

  const { canvas } = fillSphericalTexture(1024, 512, (nx, ny, nz) => {
    const wx = noiseB.fbm(nx * 3.2, ny * 3.2, nz * 3.2, 3) - 0.5;
    const wy = noiseB.fbm(nx * 3.2 + 7.1, ny * 3.2, nz * 3.2 + 3.4, 3) - 0.5;
    const wz = noiseB.fbm(nx * 3.2 + 2.9, ny * 3.2 + 9.2, nz * 3.2, 3) - 0.5;

    // Slightly stretched along longitude for realistic jet-stream wisps
    const c1 = noiseA.fbm(nx * 4.0 + wx * 1.4, ny * 6.2 + wy * 1.1, nz * 4.0 + wz * 1.4, 5);
    const c2 = noiseB.fbm(nx * 9.5 + wx * 2.0, ny * 11.0 + wy * 1.6, nz * 9.5 + wz * 2.0, 4);

    const density = c1 * 0.7 + c2 * 0.3;
    const alpha = smoothstep(0.49, 0.72, density);
    const brightness = 242 + (c2 - 0.5) * 20;
    return [brightness, brightness + 2, 255, Math.round(alpha * 228)];
  });

  return finalizePlanetTexture(canvas);
}

function generateMarsTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('mars-terrain'));
  const noiseB = new ValueNoise3D(hashString('mars-basalt'));
  const rng = createRng(hashString('mars-craters'));

  const ramp: Array<[number, RGB]> = [
    [0.0, [104, 46, 24]],
    [0.28, [148, 68, 34]],
    [0.58, [196, 98, 48]],
    [0.82, [222, 134, 78]],
    [1.0, [238, 174, 122]],
  ];

  const { canvas, ctx } = fillSphericalTexture(1024, 512, (nx, ny, nz, lon, lat) => {
    const macro = noiseA.fbm(nx * 2.6, ny * 2.6, nz * 2.6, 5);
    const basalt = noiseB.fbm(nx * 4.4 + 3.1, ny * 4.4, nz * 4.4 + 1.9, 4);
    const grit = noiseB.fbm(nx * 14, ny * 14, nz * 14, 3);

    // Polar ice caps
    const iceNoise = (macro - 0.5) * 0.1;
    if (lat > 1.38 + iceNoise || lat < -1.36 + iceNoise) {
      const s = 232 + grit * 20;
      return [s, s - 6, s - 12, 255];
    }

    let val = clamp(macro * 0.55 + basalt * 0.35 + grit * 0.16 - 0.04, 0, 1);

    // Valles Marineris canyon scar near equator (lon ~ 1.4..2.35 rad, lat ~ -0.18 rad)
    const lonNorm = lon;
    if (lonNorm > 1.25 && lonNorm < 2.45 && Math.abs(lat + 0.16) < 0.18) {
      const t = (lonNorm - 1.25) / 1.2;
      const canyonLat = -0.16 + Math.sin(t * Math.PI * 2.2) * 0.032 + (grit - 0.5) * 0.02;
      const dist = Math.abs(lat - canyonLat);
      const endFade = Math.sin(clamp(t, 0, 1) * Math.PI);
      const canyonMask = (1 - smoothstep(0.008, 0.036, dist)) * endFade;
      const rimMask =
        smoothstep(0.028, 0.045, dist) * (1 - smoothstep(0.045, 0.075, dist)) * endFade;
      val = clamp(val - canyonMask * 0.52 + rimMask * 0.14, 0, 1);
    }

    const rgb = sampleRamp(ramp, val);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  drawCraters(ctx, 1024, 512, rng, {
    count: 68,
    minRadius: 3,
    maxRadius: 24,
    bowlColor: 'rgba(98, 42, 20, 0.45)',
    rimColor: 'rgba(236, 166, 114, 0.38)',
    opacity: 0.72,
  });

  return finalizePlanetTexture(canvas);
}

function generateJupiterTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('jupiter-bands'));
  const noiseB = new ValueNoise3D(hashString('jupiter-eddies'));

  // Band palette indexed by warped latitude [-1, 1]
  const bandPalette: Array<[number, RGB]> = [
    [0.0, [112, 114, 120]], // South polar hood
    [0.14, [176, 152, 126]],
    [0.24, [232, 214, 186]], // S temperate zone
    [0.32, [164, 92, 54]], // S equatorial belt (rust)
    [0.42, [202, 134, 82]],
    [0.5, [244, 232, 208]], // Bright equatorial zone (cream)
    [0.59, [152, 76, 44]], // N equatorial belt (sienna)
    [0.67, [224, 186, 132]], // N tropical zone (ochre)
    [0.76, [186, 118, 72]],
    [0.86, [212, 190, 162]],
    [1.0, [106, 110, 118]], // North polar hood
  ];

  // Great Red Spot center in (lon, lat)
  const grsLon = 2.6;
  const grsLat = -0.37; // ~21 deg South
  const grsRx = 0.32;
  const grsRy = 0.145;

  // Smaller white storm ovals
  const whiteOvals: Array<[number, number, number, number]> = [
    [1.1, -0.56, 0.09, 0.048],
    [4.5, -0.58, 0.085, 0.045],
    [5.4, 0.44, 0.075, 0.04],
  ];

  const { canvas } = fillSphericalTexture(1024, 512, (nx, ny, nz, lon, lat) => {
    // Turbulent Kelvin-Helmholtz swirls along zonal bands
    const swirl1 = noiseB.fbm(nx * 3.8, ny * 11.0, nz * 3.8, 4) - 0.5;
    const swirl2 = noiseA.fbm(nx * 9.0 + swirl1 * 2.2, ny * 18.0, nz * 9.0 + swirl1 * 2.2, 4) - 0.5;

    // Deflect bands gracefully around the Great Red Spot
    let dLon = lon - grsLon;
    if (dLon > Math.PI) dLon -= Math.PI * 2;
    if (dLon < -Math.PI) dLon += Math.PI * 2;
    const dLat = lat - grsLat;
    const grsDistSq = (dLon * dLon) / (grsRx * grsRx) + (dLat * dLat) / (grsRy * grsRy);
    const deflect = Math.exp(-grsDistSq * 0.65) * Math.sign(dLat || 1) * 0.065;

    const warpedLat = clamp(0.5 + ny * 0.5 + swirl1 * 0.055 + swirl2 * 0.022 + deflect, 0, 1);
    let rgb = sampleRamp(bandPalette, warpedLat);

    // Fine zonal streaks & festoons
    const fineBand = Math.sin((ny * 28 + swirl1 * 2.4) * Math.PI) * 0.5 + 0.5;
    const tint = (fineBand - 0.5) * 20 + swirl2 * 22;
    rgb = [rgb[0] + tint, rgb[1] + tint * 0.85, rgb[2] + tint * 0.65];

    // Great Red Spot with counter-clockwise swirling spiral
    if (grsDistSq < 1.55) {
      const r = Math.sqrt(grsDistSq);
      const collar = smoothstep(0.85, 1.05, r) * (1 - smoothstep(1.05, 1.24, r));
      rgb = lerpRGB(rgb, [244, 232, 214], collar * 0.65);

      if (r < 1.02) {
        const angle = Math.atan2(dLat / grsRy, dLon / grsRx);
        const spiral = Math.sin(angle * 2 + r * 9.5 + swirl2 * 2.5) * 0.5 + 0.5;
        const coreColor: RGB = [196, 62, 34];
        const midColor: RGB = [224, 102, 54];
        const lightSwirl: RGB = [240, 154, 104];
        let spotRgb = lerpRGB(coreColor, midColor, smoothstep(0.15, 0.85, r));
        spotRgb = lerpRGB(spotRgb, lightSwirl, spiral * 0.45 * (1 - r * 0.4));
        const mask = 1 - smoothstep(0.82, 1.02, r);
        rgb = lerpRGB(rgb, spotRgb, mask);
      }
    }

    // White storm ovals
    for (let i = 0; i < whiteOvals.length; i++) {
      const [oLon, oLat, orx, ory] = whiteOvals[i];
      let ol = lon - oLon;
      if (ol > Math.PI) ol -= Math.PI * 2;
      if (ol < -Math.PI) ol += Math.PI * 2;
      const od = (ol * ol) / (orx * orx) + ((lat - oLat) * (lat - oLat)) / (ory * ory);
      if (od < 1.0) {
        const mask = 1 - smoothstep(0.45, 1.0, Math.sqrt(od));
        rgb = lerpRGB(rgb, [246, 240, 228], mask * 0.85);
      }
    }

    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateSaturnTexture(): THREE.CanvasTexture {
  const noise = new ValueNoise3D(hashString('saturn-bands'));

  const palette: Array<[number, RGB]> = [
    [0.0, [142, 146, 134]], // South pole
    [0.14, [196, 168, 114]],
    [0.28, [224, 198, 144]],
    [0.42, [212, 178, 118]],
    [0.52, [244, 228, 186]], // Bright creamy equatorial zone
    [0.64, [218, 184, 124]],
    [0.78, [232, 206, 152]],
    [0.9, [182, 168, 130]],
    [1.0, [126, 148, 146]], // Subtle muted north polar hexagon tint
  ];

  const { canvas } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const gentle = noise.fbm(nx * 2.5, ny * 9.0, nz * 2.5, 4) - 0.5;
    const t = clamp(0.5 + ny * 0.5 + gentle * 0.032, 0, 1);
    let rgb = sampleRamp(palette, t);
    const fine = Math.sin((ny * 22 + gentle * 1.1) * Math.PI) * 7;
    rgb = [rgb[0] + fine, rgb[1] + fine * 0.9, rgb[2] + fine * 0.75];
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateUranusTexture(): THREE.CanvasTexture {
  const noise = new ValueNoise3D(hashString('uranus-bands'));

  const palette: Array<[number, RGB]> = [
    [0.0, [186, 240, 244]], // Bright polar haze
    [0.25, [144, 222, 232]],
    [0.5, [124, 212, 224]],
    [0.75, [152, 228, 236]],
    [1.0, [196, 246, 248]],
  ];

  const { canvas } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const wisp = noise.fbm(nx * 2.2, ny * 6.0, nz * 2.2, 3) - 0.5;
    const t = clamp(0.5 + ny * 0.5 + wisp * 0.04, 0, 1);
    let rgb = sampleRamp(palette, t);
    const subtleBand = Math.sin(ny * 14 * Math.PI) * 5;
    rgb = [rgb[0] + subtleBand, rgb[1] + subtleBand, rgb[2] + subtleBand * 0.8];
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateNeptuneTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('neptune-bands'));
  const noiseB = new ValueNoise3D(hashString('neptune-streaks'));

  const palette: Array<[number, RGB]> = [
    [0.0, [24, 54, 142]],
    [0.25, [34, 78, 188]],
    [0.48, [44, 102, 218]],
    [0.72, [28, 68, 174]],
    [1.0, [22, 52, 138]],
  ];

  // Great Dark Spot + companion dark oval
  const gdsLon = 3.5;
  const gdsLat = -0.35;
  const gdsRx = 0.25;
  const gdsRy = 0.13;

  const { canvas } = fillSphericalTexture(512, 256, (nx, ny, nz, lon, lat) => {
    const swirl = noiseA.fbm(nx * 3.0, ny * 9.0, nz * 3.0, 4) - 0.5;
    const t = clamp(0.5 + ny * 0.5 + swirl * 0.08, 0, 1);
    let rgb = sampleRamp(palette, t);

    const bandMod = Math.sin((ny * 16 + swirl * 1.6) * Math.PI) * 12;
    rgb = [rgb[0] + bandMod * 0.5, rgb[1] + bandMod * 0.75, rgb[2] + bandMod];

    // Great Dark Spot
    let dLon = lon - gdsLon;
    if (dLon > Math.PI) dLon -= Math.PI * 2;
    if (dLon < -Math.PI) dLon += Math.PI * 2;
    const dLat = lat - gdsLat;
    const d2 = (dLon * dLon) / (gdsRx * gdsRx) + (dLat * dLat) / (gdsRy * gdsRy);
    if (d2 < 1.1) {
      const mask = 1 - smoothstep(0.4, 1.05, Math.sqrt(d2));
      rgb = lerpRGB(rgb, [14, 30, 92], mask * 0.82);
    }

    // Bright high-altitude white-cyan methane cirrus streaks
    const streakNoise = noiseB.fbm(nx * 2.6 + swirl * 1.2, ny * 18.0, nz * 2.6 + swirl * 1.2, 4);
    const streakMask = smoothstep(0.68, 0.82, streakNoise) * (1 - smoothstep(0.75, 0.95, Math.abs(ny)));
    rgb = lerpRGB(rgb, [212, 242, 255], streakMask * 0.85);

    // Companion bright scooter cloud just south of the Great Dark Spot
    const scDist =
      ((dLon - 0.12) * (dLon - 0.12)) / (0.16 * 0.16) +
      ((dLat + 0.14) * (dLat + 0.14)) / (0.045 * 0.045);
    if (scDist < 1.0) {
      const m = 1 - smoothstep(0.2, 1.0, Math.sqrt(scDist));
      rgb = lerpRGB(rgb, [228, 246, 255], m * 0.85);
    }

    return [rgb[0], rgb[1], rgb[2], 255];
  });

  return finalizePlanetTexture(canvas);
}

function generateMoonTexture(): THREE.CanvasTexture {
  const noiseMaria = new ValueNoise3D(hashString('moon-maria'));
  const noiseRegolith = new ValueNoise3D(hashString('moon-regolith'));
  const rng = createRng(hashString('moon-craters'));

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const maria = noiseMaria.fbm(nx * 2.1, ny * 2.1, nz * 2.1, 4);
    const grit = noiseRegolith.fbm(nx * 12, ny * 12, nz * 12, 4);
    const isMare = smoothstep(0.42, 0.56, maria);
    const base = lerp(84, 178, isMare) + (grit - 0.5) * 34;
    return [base, base - 1, base - 4, 255];
  });

  drawCraters(ctx, 512, 256, rng, {
    count: 85,
    minRadius: 2,
    maxRadius: 20,
    bowlColor: 'rgba(72, 72, 70, 0.68)',
    rimColor: 'rgba(218, 216, 210, 0.62)',
    rayCount: 5,
    rayColor: 'rgba(232, 230, 224, 0.3)',
    opacity: 0.88,
  });

  return finalizePlanetTexture(canvas);
}

function generateIoTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('io-sulfur'));
  const noiseB = new ValueNoise3D(hashString('io-volcano'));
  const rng = createRng(hashString('io-calderas'));

  const ramp: Array<[number, RGB]> = [
    [0.0, [168, 72, 24]],
    [0.3, [218, 154, 38]],
    [0.65, [238, 210, 74]],
    [0.88, [248, 236, 152]],
    [1.0, [252, 248, 212]],
  ];

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const base = noiseA.fbm(nx * 3.4, ny * 3.4, nz * 3.4, 5);
    const patch = noiseB.fbm(nx * 8.0, ny * 8.0, nz * 8.0, 4);
    const val = clamp(base * 0.65 + patch * 0.35, 0, 1);
    const rgb = sampleRamp(ramp, val);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  // Dark volcanic calderas ringed by reddish-orange sulfur plumes
  for (let i = 0; i < 24; i++) {
    const cx = rng() * 512;
    const cy = lerp(24, 232, rng());
    const r = lerp(2.5, 9, Math.pow(rng(), 1.8));
    for (const ox of [-512, 0, 512]) {
      const x = cx + ox;
      if (x + r * 3 < 0 || x - r * 3 > 512) continue;
      const plume = ctx.createRadialGradient(x, cy, r * 0.5, x, cy, r * 2.5);
      plume.addColorStop(0, 'rgba(182, 54, 18, 0.65)');
      plume.addColorStop(1, 'rgba(182, 54, 18, 0)');
      ctx.fillStyle = plume;
      ctx.beginPath();
      ctx.arc(x, cy, r * 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(38, 22, 14, 0.88)';
      ctx.beginPath();
      ctx.arc(x, cy, r * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  return finalizePlanetTexture(canvas);
}

function generateEuropaTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('europa-ice'));
  const noiseB = new ValueNoise3D(hashString('europa-cracks'));
  const rng = createRng(hashString('europa-lineae'));

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const ice = noiseA.fbm(nx * 3.5, ny * 3.5, nz * 3.5, 4);
    const stain = noiseB.fbm(nx * 6.0, ny * 6.0, nz * 6.0, 4);
    const base = lerpRGB([194, 212, 226], [238, 244, 248], ice);
    const rgb = lerpRGB(base, [186, 152, 126], smoothstep(0.62, 0.85, stain) * 0.42);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  // Crisscrossing reddish-brown tectonic lineae fractures
  ctx.save();
  for (let i = 0; i < 42; i++) {
    const y0 = rng() * 256;
    const y1 = clamp(y0 + (rng() - 0.5) * 140, 8, 248);
    const x0 = rng() * 512;
    const len = lerp(80, 260, rng());
    const ctrlY = (y0 + y1) * 0.5 + (rng() - 0.5) * 40;
    ctx.strokeStyle =
      rng() < 0.55 ? 'rgba(146, 92, 64, 0.52)' : 'rgba(176, 126, 92, 0.38)';
    ctx.lineWidth = lerp(0.7, 2.1, rng());

    for (const ox of [-512, 0, 512]) {
      ctx.beginPath();
      ctx.moveTo(x0 + ox, y0);
      ctx.quadraticCurveTo(x0 + ox + len * 0.5, ctrlY, x0 + ox + len, y1);
      ctx.stroke();
    }
  }
  ctx.restore();

  return finalizePlanetTexture(canvas);
}

function generateGanymedeTexture(): THREE.CanvasTexture {
  const noiseA = new ValueNoise3D(hashString('ganymede-regions'));
  const noiseB = new ValueNoise3D(hashString('ganymede-grooves'));
  const rng = createRng(hashString('ganymede-craters'));

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const region = noiseA.fbm(nx * 2.8, ny * 2.8, nz * 2.8, 4);
    const grooves = noiseB.ridged(nx * 10, ny * 10, nz * 10, 4);
    const darkTerrain: RGB = [98, 88, 78];
    const lightTerrain: RGB = [174, 166, 154];
    let rgb = lerpRGB(darkTerrain, lightTerrain, smoothstep(0.4, 0.62, region));
    const g = (grooves - 0.5) * 26;
    rgb = [rgb[0] + g, rgb[1] + g, rgb[2] + g * 0.95];
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  drawCraters(ctx, 512, 256, rng, {
    count: 55,
    minRadius: 2,
    maxRadius: 14,
    bowlColor: 'rgba(84, 76, 68, 0.5)',
    rimColor: 'rgba(228, 224, 216, 0.65)',
    rayCount: 4,
    rayColor: 'rgba(236, 232, 224, 0.28)',
    opacity: 0.8,
  });

  return finalizePlanetTexture(canvas);
}

function generateCallistoTexture(): THREE.CanvasTexture {
  const noise = new ValueNoise3D(hashString('callisto-base'));
  const rng = createRng(hashString('callisto-craters'));

  const { canvas, ctx } = fillSphericalTexture(512, 256, (nx, ny, nz) => {
    const n = noise.fbm(nx * 4.0, ny * 4.0, nz * 4.0, 4);
    const rgb = lerpRGB([56, 50, 44], [94, 86, 76], n);
    return [rgb[0], rgb[1], rgb[2], 255];
  });

  // Densely peppered with bright icy pinprick craters
  drawCraters(ctx, 512, 256, rng, {
    count: 110,
    minRadius: 1.5,
    maxRadius: 10,
    bowlColor: 'rgba(46, 40, 35, 0.6)',
    rimColor: 'rgba(222, 216, 204, 0.78)',
    rayCount: 3,
    rayColor: 'rgba(228, 222, 210, 0.22)',
    opacity: 0.9,
  });

  return finalizePlanetTexture(canvas);
}

function generateFallbackTexture(id: string): THREE.CanvasTexture {
  const noise = new ValueNoise3D(hashString(`fallback-${id}`));
  const { canvas } = fillSphericalTexture(256, 128, (nx, ny, nz) => {
    const n = noise.fbm(nx * 3.5, ny * 3.5, nz * 3.5, 4);
    const c = Math.round(lerp(90, 185, n));
    return [c, c, c, 255];
  });
  return finalizePlanetTexture(canvas);
}

// ---------------------------------------------------------------------------
// Public API (with deterministic caching)
// ---------------------------------------------------------------------------

const planetTextureCache = new Map<string, THREE.CanvasTexture>();
const ringTextureCache = new Map<string, THREE.CanvasTexture>();
const glowTextureCache = new Map<string, THREE.CanvasTexture>();

export function createPlanetTexture(id: string): THREE.CanvasTexture {
  const key = id.toLowerCase();
  const cached = planetTextureCache.get(key);
  if (cached) return cached;

  let texture: THREE.CanvasTexture;
  switch (key) {
    case 'sun':
      texture = generateSunTexture();
      break;
    case 'mercury':
      texture = generateMercuryTexture();
      break;
    case 'venus':
      texture = generateVenusTexture();
      break;
    case 'earth':
      texture = generateEarthTexture();
      break;
    case 'earth-clouds':
      texture = generateEarthCloudsTexture();
      break;
    case 'mars':
      texture = generateMarsTexture();
      break;
    case 'jupiter':
      texture = generateJupiterTexture();
      break;
    case 'saturn':
      texture = generateSaturnTexture();
      break;
    case 'uranus':
      texture = generateUranusTexture();
      break;
    case 'neptune':
      texture = generateNeptuneTexture();
      break;
    case 'moon':
      texture = generateMoonTexture();
      break;
    case 'io':
      texture = generateIoTexture();
      break;
    case 'europa':
      texture = generateEuropaTexture();
      break;
    case 'ganymede':
      texture = generateGanymedeTexture();
      break;
    case 'callisto':
      texture = generateCallistoTexture();
      break;
    default:
      texture = generateFallbackTexture(key);
      break;
  }

  planetTextureCache.set(key, texture);
  return texture;
}

export function createRingTexture(id: 'saturn' | 'uranus'): THREE.CanvasTexture {
  const cached = ringTextureCache.get(id);
  if (cached) return cached;

  const width = 512;
  const height = 32;
  const { canvas, ctx } = createCanvas(width, height);
  const img = ctx.createImageData(width, height);
  const data = img.data;
  const rng = createRng(hashString(`ring-${id}`));

  // Precompute deterministic radial ringlets
  const radialNoise = new Float32Array(width);
  let acc = 0.5;
  for (let x = 0; x < width; x++) {
    acc = acc * 0.65 + rng() * 0.35;
    radialNoise[x] = acc;
  }

  for (let x = 0; x < width; x++) {
    const u = x / (width - 1);
    const fine =
      Math.sin(u * 190) * 0.25 +
      Math.sin(u * 430 + 1.3) * 0.2 +
      (radialNoise[x] - 0.5) * 0.55;

    let r = 220;
    let g = 200;
    let b = 165;
    let a = 0;

    if (id === 'saturn') {
      if (u < 0.04 || u > 0.96) {
        a = 0;
      } else if (u < 0.22) {
        // C Ring (faint, smoky translucent taupe)
        const fade = smoothstep(0.04, 0.1, u);
        r = 168 + fine * 20;
        g = 152 + fine * 18;
        b = 128 + fine * 16;
        a = fade * clamp(0.2 + fine * 0.12, 0.06, 0.34);
      } else if (u < 0.58) {
        // B Ring (dense bright cream/gold)
        const innerRamp = smoothstep(0.22, 0.26, u);
        const outerRamp = 1 - smoothstep(0.555, 0.58, u);
        r = 236 + fine * 18;
        g = 216 + fine * 18;
        b = 176 + fine * 18;
        a = innerRamp * outerRamp * clamp(0.84 + fine * 0.16, 0.62, 0.96);
      } else if (u < 0.645) {
        // Cassini Division (crisp dark gap)
        r = 90;
        g = 82;
        b = 70;
        a = 0.03;
      } else if (u < 0.9) {
        // A Ring (medium tan) with Encke Gap around u = 0.835
        const encke = 1 - Math.exp(-Math.pow((u - 0.835) / 0.008, 2));
        const innerRamp = smoothstep(0.645, 0.665, u);
        const outerRamp = 1 - smoothstep(0.88, 0.9, u);
        r = 210 + fine * 18;
        g = 190 + fine * 16;
        b = 154 + fine * 15;
        a = innerRamp * outerRamp * encke * clamp(0.6 + fine * 0.14, 0.38, 0.74);
      } else if (u > 0.928 && u < 0.946) {
        // Narrow F Ring
        const fPeak = Math.exp(-Math.pow((u - 0.937) / 0.004, 2));
        r = 236;
        g = 222;
        b = 192;
        a = fPeak * 0.42;
      }
    } else {
      // Uranus: delicate faint cyan-white narrow rings
      const uranusRings: Array<[number, number, number]> = [
        [0.14, 0.008, 0.14],
        [0.21, 0.007, 0.16],
        [0.28, 0.009, 0.2],
        [0.37, 0.006, 0.15],
        [0.46, 0.01, 0.22],
        [0.57, 0.007, 0.18],
        [0.68, 0.008, 0.24],
        [0.77, 0.006, 0.18],
        [0.86, 0.016, 0.46], // Epsilon ring (brightest)
      ];
      r = 186;
      g = 234;
      b = 244;
      let alphaSum = 0;
      for (let i = 0; i < uranusRings.length; i++) {
        const [pos, widthSigma, strength] = uranusRings[i];
        alphaSum += strength * Math.exp(-Math.pow((u - pos) / widthSigma, 2));
      }
      // Very faint dust sheet between rings
      if (u > 0.1 && u < 0.9) {
        alphaSum += 0.03;
      }
      a = clamp(alphaSum, 0, 0.55);
    }

    const rByte = clamp(Math.round(r), 0, 255);
    const gByte = clamp(Math.round(g), 0, 255);
    const bByte = clamp(Math.round(b), 0, 255);
    const aByte = clamp(Math.round(a * 255), 0, 255);

    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      data[idx] = rByte;
      data[idx + 1] = gByte;
      data[idx + 2] = bByte;
      data[idx + 3] = aByte;
    }
  }

  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  ringTextureCache.set(id, texture);
  return texture;
}

export function createGlowTexture(colorHex = '#ffdd88'): THREE.CanvasTexture {
  const key = colorHex.toLowerCase().trim();
  const cached = glowTextureCache.get(key);
  if (cached) return cached;

  const size = 256;
  const half = size / 2;
  const { canvas, ctx } = createCanvas(size, size);
  const [r, g, b] = hexToRgb(key);

  // Hot white-tinted center blending smoothly into colorHex and transparent edge
  const coreR = Math.round(lerp(r, 255, 0.72));
  const coreG = Math.round(lerp(g, 255, 0.72));
  const coreB = Math.round(lerp(b, 255, 0.72));

  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0, `rgba(${coreR}, ${coreG}, ${coreB}, 1.0)`);
  grad.addColorStop(0.18, `rgba(${coreR}, ${coreG}, ${coreB}, 0.85)`);
  grad.addColorStop(0.42, `rgba(${r}, ${g}, ${b}, 0.42)`);
  grad.addColorStop(0.7, `rgba(${r}, ${g}, ${b}, 0.12)`);
  grad.addColorStop(1.0, `rgba(${r}, ${g}, ${b}, 0.0)`);

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  glowTextureCache.set(key, texture);
  return texture;
}
