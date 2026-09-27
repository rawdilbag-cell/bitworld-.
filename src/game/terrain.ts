import * as THREE from 'three';

// Fast 2D Simplex/Perlin-like noise generator
class NoiseGenerator {
  private p: number[] = [];

  constructor(seed = 1337) {
    const permutation = [];
    for (let i = 0; i < 256; i++) {
      permutation[i] = i;
    }
    // Pseudo-random shuffle
    let s = seed;
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647;
      const j = Math.floor((s / 2147483647) * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    for (let i = 0; i < 512; i++) {
      this.p[i] = permutation[i & 255];
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number): number {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  public perlin2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.p[this.p[X] + Y];
    const ab = this.p[this.p[X] + Y + 1];
    const ba = this.p[this.p[X + 1] + Y];
    const bb = this.p[this.p[X + 1] + Y + 1];

    const x1 = this.lerp(u, this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf));
    const x2 = this.lerp(u, this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1));

    return this.lerp(v, x1, x2);
  }

  public fbm(x: number, y: number, octaves = 4, persistence = 0.5): number {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.perlin2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return total / maxValue;
  }
}

export const noiseGen = new NoiseGenerator(4289);

// Procedural Height Calculation for any world (x, z)
export function getTerrainHeight(x: number, z: number): number {
  // Safe boundary check
  const distFromCenter = Math.hypot(x, z);
  const boundaryFalloff = Math.max(0, 1 - Math.pow(distFromCenter / 1250, 4));

  // Multi-frequency terrain:
  // Low frequency rolling hills
  const h1 = noiseGen.fbm(x * 0.0012, z * 0.0012, 4, 0.5) * 45;
  // Mid frequency ridges & dunes
  const h2 = noiseGen.fbm(x * 0.0035, z * 0.0035, 3, 0.45) * 18;
  // Local micro roughness
  const h3 = noiseGen.fbm(x * 0.012, z * 0.012, 2, 0.4) * 4;

  const rawHeight = (h1 + h2 + h3) * boundaryFalloff;
  return Math.max(0, rawHeight);
}

// Generate high-resolution procedural terrain canvas texture
function createTerrainTexture(size = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Colors:
  // Grass/Moss: [56, 75, 45]
  // Dirt/Clay: [102, 84, 65]
  // Dark Slate Rock: [52, 58, 64]
  // Sand/Dust: [142, 126, 98]

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;

      // World scale coords for noise sampling in texture space
      const n1 = noiseGen.fbm(u * 12, v * 12, 4, 0.5);
      const n2 = noiseGen.fbm(u * 32, v * 32, 2, 0.5);
      const n3 = Math.random() * 0.15; // micro grain

      // Blend factor
      const blend = (n1 + 0.5) * 0.7 + (n2 + 0.5) * 0.3 + n3;

      let r = 70;
      let g = 80;
      let b = 60;

      if (blend < 0.4) {
        // Deep rock/slate
        r = 50 + n2 * 25;
        g = 55 + n2 * 25;
        b = 58 + n2 * 25;
      } else if (blend < 0.65) {
        // Grass / tundra moss
        r = 52 + n1 * 30;
        g = 72 + n1 * 40;
        b = 46 + n1 * 20;
      } else if (blend < 0.85) {
        // Dark military dirt / mud
        r = 85 + n2 * 25;
        g = 70 + n2 * 20;
        b = 55 + n2 * 18;
      } else {
        // Sand / gravel dust
        r = 115 + n1 * 25;
        g = 105 + n1 * 22;
        b = 85 + n1 * 20;
      }

      // Add grid / track marks subtly every 64 pixels
      if ((x % 64 < 2) || (y % 64 < 2)) {
        r *= 0.9;
        g *= 0.9;
        b *= 0.9;
      }

      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(16, 16);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface TerrainResult {
  mesh: THREE.Mesh;
  props: THREE.Group;
  getTerrainHeight: (x: number, z: number) => number;
}

export function createTerrain(scene: THREE.Scene): TerrainResult {
  const mapSize = 2500;
  const segments = 120; // 120x120 vertices is balanced for performance and high fidelity

  const geometry = new THREE.PlaneGeometry(mapSize, mapSize, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = getTerrainHeight(x, z);
    posAttr.setY(i, y);
  }

  geometry.computeVertexNormals();

  const texture = createTerrainTexture(1024);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.88,
    metalness: 0.12,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = "TerrainMesh";
  scene.add(mesh);

  // Group for scattered environment props (boulders, sandbag bunkers, defensive barriers)
  const propsGroup = new THREE.Group();

  // Create shared geometries and materials for boulders
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x4a4f54,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });

  // Spawn 140 tactical boulders across the map for natural sniper cover
  for (let i = 0; i < 140; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * 1100;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    const y = getTerrainHeight(x, z);

    const rock = new THREE.Mesh(rockGeo, rockMat);
    const scaleY = 2 + Math.random() * 5;
    const scaleXZ = 3 + Math.random() * 6;
    rock.scale.set(scaleXZ, scaleY, scaleXZ);
    rock.position.set(x, y + scaleY * 0.35, z);
    rock.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
    rock.castShadow = true;
    rock.receiveShadow = true;
    propsGroup.add(rock);
  }

  scene.add(propsGroup);

  return {
    mesh,
    props: propsGroup,
    getTerrainHeight,
  };
}
