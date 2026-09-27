import * as THREE from 'three';
import { getTerrainHeight } from './terrain';

export interface OutpostCompound {
  id: number;
  position: THREE.Vector3;
  width: number;
  length: number;
  height: number;
  floor1Height: number;
  floor2Height: number;
  roofHeight: number;
  group: THREE.Group;
  // Bounding volumes for player / bot collision & climbing
  walkableSurfaces: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    height: number;
  }[];
  // Solid obstacle boxes (walls, pillars)
  obstacleBoxes: THREE.Box3[];
}

// Procedural military concrete texture with industrial panel grooves & dirt
function createConcreteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Base concrete dark grey
  ctx.fillStyle = '#2d333b';
  ctx.fillRect(0, 0, 512, 512);

  // Noise specks
  const imgData = ctx.getImageData(0, 0, 512, 512);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 28;
    data[i] = Math.min(255, Math.max(0, data[i] + grain));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + grain));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  // Panel lines
  ctx.strokeStyle = '#1b1f24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 64; x < 512; x += 128) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 512);
  }
  for (let y = 64; y < 512; y += 128) {
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
  }
  ctx.stroke();

  // Rust / dirt streaks
  ctx.strokeStyle = 'rgba(75, 55, 40, 0.25)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 15; i++) {
    const rx = Math.random() * 512;
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx + (Math.random() - 0.5) * 40, 80 + Math.random() * 120);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

// Caution stripe texture for doorways & stairs
function createCautionTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#eab308'; // Amber yellow
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#18181b'; // Black stripes
  ctx.beginPath();
  for (let i = -128; i < 256; i += 32) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 64, 128);
    ctx.lineTo(i + 32, 128);
    ctx.closePath();
  }
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  return texture;
}

export function generateOutposts(scene: THREE.Scene, count = 40): OutpostCompound[] {
  const compounds: OutpostCompound[] = [];
  const parentGroup = new THREE.Group();
  parentGroup.name = "MilitaryOutposts";

  const concreteTex = createConcreteTexture();
  const cautionTex = createCautionTexture();

  const concreteMat = new THREE.MeshStandardMaterial({
    map: concreteTex,
    roughness: 0.85,
    metalness: 0.2,
  });

  const metalGripMat = new THREE.MeshStandardMaterial({
    color: 0x333b42,
    roughness: 0.6,
    metalness: 0.65,
  });

  const cautionMat = new THREE.MeshStandardMaterial({
    map: cautionTex,
    roughness: 0.7,
    metalness: 0.1,
  });

  const darkFrameMat = new THREE.MeshStandardMaterial({
    color: 0x181c20,
    roughness: 0.5,
    metalness: 0.8,
  });

  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xff2222,
  });

  const minDistance = 140; // minimum separation between compounds
  const attempts = 300;
  let placed = 0;

  for (let a = 0; a < attempts && placed < count; a++) {
    const angle = Math.random() * Math.PI * 2;
    // Distribute from 120m to 1050m radius
    const dist = 120 + Math.sqrt(Math.random()) * 930;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;

    // Check distance with existing
    const tooClose = compounds.some(c => Math.hypot(c.position.x - px, c.position.z - pz) < minDistance);
    if (tooClose) continue;

    const baseElevation = getTerrainHeight(px, pz);

    // Compound dimensions
    const width = 24; // X size
    const length = 28; // Z size
    const floorH = 5.5; // height per floor
    const totalFloors = 2; // 2 stories + rooftop
    const roofY = baseElevation + floorH * 2;
    const floor2Y = baseElevation + floorH;

    const compoundGroup = new THREE.Group();
    compoundGroup.position.set(px, 0, pz);

    const walkableSurfaces: OutpostCompound['walkableSurfaces'] = [];
    const obstacleBoxes: THREE.Box3[] = [];

    // 1. Foundation Slab
    const slabGeo = new THREE.BoxGeometry(width + 4, 3, length + 4);
    const slabMesh = new THREE.Mesh(slabGeo, concreteMat);
    slabMesh.position.set(0, baseElevation - 0.5, 0);
    slabMesh.receiveShadow = true;
    slabMesh.castShadow = true;
    compoundGroup.add(slabMesh);

    walkableSurfaces.push({
      minX: px - (width + 4) / 2,
      maxX: px + (width + 4) / 2,
      minZ: pz - (length + 4) / 2,
      maxZ: pz + (length + 4) / 2,
      height: baseElevation + 1,
    });

    // 2. Pillars at corners and midpoints
    const pillarGeo = new THREE.BoxGeometry(1.6, floorH * 2, 1.6);
    const pillarOffsets = [
      [-width / 2 + 1, -length / 2 + 1],
      [width / 2 - 1, -length / 2 + 1],
      [-width / 2 + 1, length / 2 - 1],
      [width / 2 - 1, length / 2 - 1],
      [-width / 2 + 1, 0],
      [width / 2 - 1, 0],
    ];

    pillarOffsets.forEach(([ox, oz]) => {
      const pillar = new THREE.Mesh(pillarGeo, darkFrameMat);
      pillar.position.set(ox, baseElevation + floorH, oz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      compoundGroup.add(pillar);

      obstacleBoxes.push(new THREE.Box3(
        new THREE.Vector3(px + ox - 0.9, baseElevation, pz + oz - 0.9),
        new THREE.Vector3(px + ox + 0.9, baseElevation + floorH * 2, pz + oz + 0.9)
      ));
    });

    // 3. Ground Floor Walls with open entrance door
    // Front wall with doorway
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry((width - 6) / 2, floorH, 0.8), concreteMat);
    frontWallLeft.position.set(-width / 4 - 1.5, baseElevation + floorH / 2 + 1, length / 2);
    frontWallLeft.castShadow = true;
    frontWallLeft.receiveShadow = true;
    compoundGroup.add(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry((width - 6) / 2, floorH, 0.8), concreteMat);
    frontWallRight.position.set(width / 4 + 1.5, baseElevation + floorH / 2 + 1, length / 2);
    frontWallRight.castShadow = true;
    frontWallRight.receiveShadow = true;
    compoundGroup.add(frontWallRight);

    // Caution strip over doorway threshold
    const doorThreshold = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 2), cautionMat);
    doorThreshold.position.set(0, baseElevation + 1.05, length / 2);
    compoundGroup.add(doorThreshold);

    // Back wall with firing embrasure/window
    const backWallBottom = new THREE.Mesh(new THREE.BoxGeometry(width, 1.8, 0.8), concreteMat);
    backWallBottom.position.set(0, baseElevation + 1.9, -length / 2);
    backWallBottom.castShadow = true;
    compoundGroup.add(backWallBottom);

    const backWallTop = new THREE.Mesh(new THREE.BoxGeometry(width, 1.6, 0.8), concreteMat);
    backWallTop.position.set(0, baseElevation + floorH + 0.2, -length / 2);
    backWallTop.castShadow = true;
    compoundGroup.add(backWallTop);

    // Side Walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, floorH, length), concreteMat);
    leftWall.position.set(-width / 2, baseElevation + floorH / 2 + 1, 0);
    leftWall.castShadow = true;
    compoundGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, floorH, length), concreteMat);
    rightWall.position.set(width / 2, baseElevation + floorH / 2 + 1, 0);
    rightWall.castShadow = true;
    compoundGroup.add(rightWall);

    // 4. Floor 2 Slab (with stair opening)
    const floor2Geo = new THREE.BoxGeometry(width, 0.6, length);
    const floor2Mesh = new THREE.Mesh(floor2Geo, concreteMat);
    floor2Mesh.position.set(0, floor2Y, 0);
    floor2Mesh.receiveShadow = true;
    floor2Mesh.castShadow = true;
    compoundGroup.add(floor2Mesh);

    walkableSurfaces.push({
      minX: px - width / 2,
      maxX: px + width / 2,
      minZ: pz - length / 2,
      maxZ: pz + length / 2,
      height: floor2Y + 0.3,
    });

    // 5. Floor 2 Open Sniper Windows & Low Parapets
    // Waist-high perimeter walls for tactical sniping
    const f2FrontBar = new THREE.Mesh(new THREE.BoxGeometry(width, 1.4, 0.6), concreteMat);
    f2FrontBar.position.set(0, floor2Y + 1.0, length / 2);
    f2FrontBar.castShadow = true;
    compoundGroup.add(f2FrontBar);

    const f2BackBar = new THREE.Mesh(new THREE.BoxGeometry(width, 1.4, 0.6), concreteMat);
    f2BackBar.position.set(0, floor2Y + 1.0, -length / 2);
    f2BackBar.castShadow = true;
    compoundGroup.add(f2BackBar);

    // 6. Rooftop Slab
    const roofGeo = new THREE.BoxGeometry(width + 1, 0.7, length + 1);
    const roofMesh = new THREE.Mesh(roofGeo, concreteMat);
    roofMesh.position.set(0, roofY, 0);
    roofMesh.receiveShadow = true;
    roofMesh.castShadow = true;
    compoundGroup.add(roofMesh);

    walkableSurfaces.push({
      minX: px - (width + 1) / 2,
      maxX: px + (width + 1) / 2,
      minZ: pz - (length + 1) / 2,
      maxZ: pz + (length + 1) / 2,
      height: roofY + 0.35,
    });

    // Rooftop Parapets (Defensive Sniper Cover on roof)
    const parapetH = 1.3;
    const roofParapetFront = new THREE.Mesh(new THREE.BoxGeometry(width + 1, parapetH, 0.6), concreteMat);
    roofParapetFront.position.set(0, roofY + parapetH / 2 + 0.35, (length + 1) / 2);
    roofParapetFront.castShadow = true;
    compoundGroup.add(roofParapetFront);

    const roofParapetBack = new THREE.Mesh(new THREE.BoxGeometry(width + 1, parapetH, 0.6), concreteMat);
    roofParapetBack.position.set(0, roofY + parapetH / 2 + 0.35, -(length + 1) / 2);
    roofParapetBack.castShadow = true;
    compoundGroup.add(roofParapetBack);

    const roofParapetLeft = new THREE.Mesh(new THREE.BoxGeometry(0.6, parapetH, length + 1), concreteMat);
    roofParapetLeft.position.set(-(width + 1) / 2, roofY + parapetH / 2 + 0.35, 0);
    roofParapetLeft.castShadow = true;
    compoundGroup.add(roofParapetLeft);

    const roofParapetRight = new THREE.Mesh(new THREE.BoxGeometry(0.6, parapetH, length + 1), concreteMat);
    roofParapetRight.position.set((width + 1) / 2, roofY + parapetH / 2 + 0.35, 0);
    roofParapetRight.castShadow = true;
    compoundGroup.add(roofParapetRight);

    // 7. Interior Stairs / Ramps (Climbing from Ground to Floor 2, and Floor 2 to Roof)
    // Ramp 1 (Ground to Floor 2)
    const ramp1Len = Math.hypot(floorH, 12);
    const ramp1Angle = Math.atan2(floorH, 12);
    const ramp1Geo = new THREE.BoxGeometry(4, 0.4, ramp1Len);
    const ramp1Mesh = new THREE.Mesh(ramp1Geo, metalGripMat);
    ramp1Mesh.position.set(width / 2 - 4.5, baseElevation + 1 + floorH / 2, 0);
    ramp1Mesh.rotation.x = ramp1Angle;
    ramp1Mesh.castShadow = true;
    compoundGroup.add(ramp1Mesh);

    // Ramp 2 (Floor 2 to Rooftop)
    const ramp2Mesh = new THREE.Mesh(ramp1Geo, metalGripMat);
    ramp2Mesh.position.set(-width / 2 + 4.5, floor2Y + floorH / 2, 0);
    ramp2Mesh.rotation.x = -ramp1Angle;
    ramp2Mesh.castShadow = true;
    compoundGroup.add(ramp2Mesh);

    // 8. Communications Antenna Mast with blinking red beacon
    const mastHeight = 14;
    const mastGeo = new THREE.CylinderGeometry(0.12, 0.25, mastHeight, 6);
    const mastMesh = new THREE.Mesh(mastGeo, darkFrameMat);
    mastMesh.position.set(width / 2 - 2, roofY + mastHeight / 2, -length / 2 + 2);
    mastMesh.castShadow = true;
    compoundGroup.add(mastMesh);

    const beaconGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(width / 2 - 2, roofY + mastHeight + 0.2, -length / 2 + 2);
    compoundGroup.add(beaconMesh);

    parentGroup.add(compoundGroup);

    compounds.push({
      id: placed + 1,
      position: new THREE.Vector3(px, baseElevation, pz),
      width,
      length,
      height: roofY - baseElevation + mastHeight,
      floor1Height: baseElevation + 1,
      floor2Height: floor2Y + 0.3,
      roofHeight: roofY + 0.35,
      group: compoundGroup,
      walkableSurfaces,
      obstacleBoxes,
    });

    placed++;
  }

  scene.add(parentGroup);
  return compounds;
}

// Function to resolve player / bot vertical placement on multi-story surfaces
export function checkStructureElevation(
  x: number,
  y: number,
  z: number,
  compounds: OutpostCompound[]
): number | null {
  for (const c of compounds) {
    // Fast AABB check around compound
    const dx = Math.abs(x - c.position.x);
    const dz = Math.abs(z - c.position.z);
    if (dx > c.width / 2 + 3 || dz > c.length / 2 + 3) continue;

    // Check walkable surfaces from highest to lowest
    const sortedSurfaces = [...c.walkableSurfaces].sort((a, b) => b.height - a.height);
    for (const s of sortedSurfaces) {
      if (x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ) {
        // If entity is above or close to surface height, snap to surface
        if (y >= s.height - 1.5 && y <= s.height + 4.5) {
          return s.height;
        }
      }
    }
  }
  return null;
}
