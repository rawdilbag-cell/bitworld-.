import * as THREE from 'three';

export interface DroneObject {
  mesh: THREE.Group;
  thrusterCones: THREE.Mesh[];
  muzzleLeft: THREE.Vector3;
  muzzleRight: THREE.Vector3;
  coreMaterial: THREE.MeshBasicMaterial;
  visorMaterial: THREE.MeshBasicMaterial;
  getMuzzleWorldPosition: (isRight: boolean) => THREE.Vector3;
  updateHover: (time: number, isMoving: boolean, strafe: number, forward: number) => void;
}

export function createTacticalDrone(isPlayer = true): DroneObject {
  const droneGroup = new THREE.Group();
  droneGroup.name = isPlayer ? "PlayerDrone" : "BotDrone";

  // Tactical Materials
  const hullArmorMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x1f2937 : 0x18181b,
    metalness: 0.85,
    roughness: 0.24,
    flatShading: false,
  });

  const secondaryArmorMat = new THREE.MeshStandardMaterial({
    color: isPlayer ? 0x374151 : 0x27272a,
    metalness: 0.9,
    roughness: 0.3,
  });

  const weaponSteelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.95,
    roughness: 0.18,
  });

  const glowColor = isPlayer ? 0x06b6d4 : 0xef4444; // Cyan vs Red
  const coreMat = new THREE.MeshBasicMaterial({
    color: glowColor,
  });

  const visorColor = isPlayer ? 0x38bdf8 : 0xf87171;
  const visorMat = new THREE.MeshBasicMaterial({
    color: visorColor,
  });

  const thrusterColor = isPlayer ? 0x67e8f9 : 0xfca5a5;
  const thrusterGlowMat = new THREE.MeshBasicMaterial({
    color: thrusterColor,
    transparent: true,
    opacity: 0.8,
  });

  // 1. Central Core Fuselage (Chassis)
  const chassisGeo = new THREE.BoxGeometry(1.4, 0.6, 2.4);
  const chassisMesh = new THREE.Mesh(chassisGeo, hullArmorMat);
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  droneGroup.add(chassisMesh);

  // Sloped Upper Hull Plate
  const upperHullGeo = new THREE.ConeGeometry(0.9, 2.0, 4);
  upperHullGeo.rotateX(Math.PI / 2);
  upperHullGeo.rotateY(Math.PI / 4);
  const upperHull = new THREE.Mesh(upperHullGeo, secondaryArmorMat);
  upperHull.position.set(0, 0.38, 0);
  upperHull.scale.set(1.4, 0.7, 1.2);
  upperHull.castShadow = true;
  droneGroup.add(upperHull);

  // 2. Optical Sensor Visor (Head / Cockpit)
  const visorGeo = new THREE.BoxGeometry(0.8, 0.18, 0.5);
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.22, 1.1);
  droneGroup.add(visorMesh);

  // 3. Glowing Reactor Core
  const coreGeo = new THREE.SphereGeometry(0.3, 12, 12);
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0, 0.1, -0.2);
  droneGroup.add(coreMesh);

  // 4. Lateral Weapon Wings / Pylons
  const wingGeo = new THREE.BoxGeometry(1.2, 0.12, 0.9);
  // Left Wing
  const leftWing = new THREE.Mesh(wingGeo, hullArmorMat);
  leftWing.position.set(-1.2, 0.05, 0.1);
  leftWing.rotation.z = -0.08;
  leftWing.castShadow = true;
  droneGroup.add(leftWing);

  // Right Wing
  const rightWing = new THREE.Mesh(wingGeo, hullArmorMat);
  rightWing.position.set(1.2, 0.05, 0.1);
  rightWing.rotation.z = 0.08;
  rightWing.castShadow = true;
  droneGroup.add(rightWing);

  // 5. Heavy Dual Plasma Cannons
  const cannonGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.8, 8);
  cannonGeo.rotateX(Math.PI / 2);

  // Left Cannon
  const leftCannon = new THREE.Mesh(cannonGeo, weaponSteelMat);
  leftCannon.position.set(-1.7, -0.05, 0.6);
  leftCannon.castShadow = true;
  droneGroup.add(leftCannon);

  // Right Cannon
  const rightCannon = new THREE.Mesh(cannonGeo, weaponSteelMat);
  rightCannon.position.set(1.7, -0.05, 0.6);
  rightCannon.castShadow = true;
  droneGroup.add(rightCannon);

  // Muzzle points in local space
  const muzzleLeft = new THREE.Vector3(-1.7, -0.05, 1.6);
  const muzzleRight = new THREE.Vector3(1.7, -0.05, 1.6);

  // 6. Thruster Pods (Left & Right rear)
  const thrusterGeo = new THREE.CylinderGeometry(0.22, 0.28, 0.8, 8);
  thrusterGeo.rotateX(Math.PI / 2);

  const leftThruster = new THREE.Mesh(thrusterGeo, secondaryArmorMat);
  leftThruster.position.set(-0.9, 0.05, -1.2);
  leftThruster.castShadow = true;
  droneGroup.add(leftThruster);

  const rightThruster = new THREE.Mesh(thrusterGeo, secondaryArmorMat);
  rightThruster.position.set(0.9, 0.05, -1.2);
  rightThruster.castShadow = true;
  droneGroup.add(rightThruster);

  // Glowing Thruster Exhaust Flames
  const flameGeo = new THREE.ConeGeometry(0.2, 0.7, 8);
  flameGeo.rotateX(-Math.PI / 2);

  const leftFlame = new THREE.Mesh(flameGeo, thrusterGlowMat);
  leftFlame.position.set(-0.9, 0.05, -1.8);
  droneGroup.add(leftFlame);

  const rightFlame = new THREE.Mesh(flameGeo, thrusterGlowMat);
  rightFlame.position.set(0.9, 0.05, -1.8);
  droneGroup.add(rightFlame);

  // 7. Stabilizer Tail Fins
  const finGeo = new THREE.BoxGeometry(0.08, 0.6, 0.7);
  const leftFin = new THREE.Mesh(finGeo, hullArmorMat);
  leftFin.position.set(-0.7, 0.45, -1.1);
  leftFin.rotation.z = -0.25;
  droneGroup.add(leftFin);

  const rightFin = new THREE.Mesh(finGeo, hullArmorMat);
  rightFin.position.set(0.7, 0.45, -1.1);
  rightFin.rotation.z = 0.25;
  droneGroup.add(rightFin);

  const thrusterCones = [leftFlame, rightFlame];

  // Helper to obtain world coordinates of left or right muzzle
  const getMuzzleWorldPosition = (isRight: boolean): THREE.Vector3 => {
    const local = isRight ? muzzleRight.clone() : muzzleLeft.clone();
    return local.applyMatrix4(droneGroup.matrixWorld);
  };

  // Hover bobbing & banking physics
  const updateHover = (time: number, isMoving: boolean, strafe: number, forward: number) => {
    // Subtle idle hover bobbing
    const hoverOffset = Math.sin(time * 3.5) * 0.08;
    chassisMesh.position.y = hoverOffset;

    // Banking roll when strafing (-1 = left, 1 = right)
    const targetRoll = -strafe * 0.28;
    droneGroup.rotation.z = THREE.MathUtils.lerp(droneGroup.rotation.z, targetRoll, 0.12);

    // Pitch tilt when accelerating forward or back
    const targetPitch = forward * 0.18;
    droneGroup.rotation.x = THREE.MathUtils.lerp(droneGroup.rotation.x, targetPitch, 0.12);

    // Dynamic thruster flame pulsation
    const flameScale = (isMoving ? 1.4 : 0.8) + Math.sin(time * 24) * 0.2;
    leftFlame.scale.set(1, flameScale, 1);
    rightFlame.scale.set(1, flameScale, 1);
  };

  return {
    mesh: droneGroup,
    thrusterCones,
    muzzleLeft,
    muzzleRight,
    coreMaterial: coreMat,
    visorMaterial: visorMat,
    getMuzzleWorldPosition,
    updateHover,
  };
}
