import * as THREE from 'three';

export interface LaserBullet {
  mesh: THREE.Mesh;
  light?: THREE.PointLight;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  velocity: number;
  distanceTraveled: number;
  maxDistance: number;
  damage: number;
  isPlayer: boolean;
  shooterName: string;
  active: boolean;
}

export interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scaleDelta: number;
  rotVelocity: THREE.Vector3;
  color?: THREE.Color;
}

export class CombatEffectsSystem {
  private scene: THREE.Scene;
  public bullets: LaserBullet[] = [];
  public particles: Particle[] = [];
  private muzzleFlashLights: { light: THREE.PointLight; timer: number }[] = [];

  // Shared Geometries & Materials
  private playerLaserGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6);
  private botLaserGeo = new THREE.CylinderGeometry(0.14, 0.14, 2.8, 6);
  private railgunGeo = new THREE.CylinderGeometry(0.2, 0.2, 5.0, 8);

  private playerLaserMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  private botLaserMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  private railgunMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });

  private sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  private sparkMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

  private fireGeo = new THREE.DodecahedronGeometry(0.6, 1);
  private smokeMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.9,
    transparent: true,
    opacity: 0.8,
  });

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Align cylinders along forward Z-axis
    this.playerLaserGeo.rotateX(Math.PI / 2);
    this.botLaserGeo.rotateX(Math.PI / 2);
    this.railgunGeo.rotateX(Math.PI / 2);

    // Pool of 4 point lights for dynamic muzzle flashes
    for (let i = 0; i < 4; i++) {
      const pLight = new THREE.PointLight(0x38bdf8, 0, 30);
      scene.add(pLight);
      this.muzzleFlashLights.push({ light: pLight, timer: 0 });
    }
  }

  // Trigger dynamic muzzle flash at weapon nozzle
  public triggerMuzzleFlash(position: THREE.Vector3, isPlayer = true, isRailgun = false): void {
    const flash = this.muzzleFlashLights.find(f => f.timer <= 0) || this.muzzleFlashLights[0];
    flash.light.position.copy(position);
    flash.light.color.setHex(isRailgun ? 0xc084fc : isPlayer ? 0x38bdf8 : 0xef4444);
    flash.light.intensity = isRailgun ? 80 : 35;
    flash.timer = 0.06;

    // Small burst of muzzle sparks
    for (let i = 0; i < 5; i++) {
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      spark.position.copy(position);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );
      this.particles.push({
        mesh: spark,
        velocity: vel,
        life: 0.15,
        maxLife: 0.15,
        scaleDelta: -0.9,
        rotVelocity: new THREE.Vector3(1, 1, 1),
      });
      this.scene.add(spark);
    }
  }

  // Spawn laser projectile
  public spawnLaser(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    isPlayer: boolean,
    isRailgun: boolean,
    shooterName: string
  ): LaserBullet {
    const geo = isRailgun ? this.railgunGeo : isPlayer ? this.playerLaserGeo : this.botLaserGeo;
    const mat = isRailgun ? this.railgunMat : isPlayer ? this.playerLaserMat : this.botLaserMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(direction));

    const bullet: LaserBullet = {
      mesh,
      origin: origin.clone(),
      direction: direction.clone().normalize(),
      velocity: isRailgun ? 420 : 280, // High velocity
      distanceTraveled: 0,
      maxDistance: isRailgun ? 800 : 450,
      damage: isRailgun ? 85 : isPlayer ? 22 : 14,
      isPlayer,
      shooterName,
      active: true,
    };

    this.scene.add(mesh);
    this.bullets.push(bullet);
    this.triggerMuzzleFlash(origin, isPlayer, isRailgun);

    return bullet;
  }

  // Create sparks and debris when bullet hits surface or entity
  public createImpactSparks(position: THREE.Vector3, normal: THREE.Vector3, isFlesh = false): void {
    const count = isFlesh ? 6 : 10;
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      p.position.copy(position);

      // Bounce velocity along surface normal with spread
      const vel = normal.clone().multiplyScalar(4 + Math.random() * 8);
      vel.x += (Math.random() - 0.5) * 6;
      vel.y += Math.random() * 5;
      vel.z += (Math.random() - 0.5) * 6;

      this.particles.push({
        mesh: p,
        velocity: vel,
        life: 0.35 + Math.random() * 0.2,
        maxLife: 0.5,
        scaleDelta: -0.7,
        rotVelocity: new THREE.Vector3(Math.random() * 4, Math.random() * 4, 0),
      });
      this.scene.add(p);
    }
  }

  // Massive explosion when bot is destroyed
  public createBotExplosion(position: THREE.Vector3): void {
    // Dynamic flash light
    this.triggerMuzzleFlash(position, false, true);

    // Fireball puffs
    for (let i = 0; i < 18; i++) {
      const fireMat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.4 ? 0xf97316 : 0xfacc15,
      });
      const p = new THREE.Mesh(this.fireGeo, fireMat);
      p.position.copy(position);
      p.scale.setScalar(0.8 + Math.random() * 1.5);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 16,
        2 + Math.random() * 14,
        (Math.random() - 0.5) * 16
      );

      this.particles.push({
        mesh: p,
        velocity: vel,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 1.0,
        scaleDelta: 0.8, // expands then shrinks
        rotVelocity: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      });
      this.scene.add(p);
    }

    // Heavy dark smoke billows
    for (let i = 0; i < 12; i++) {
      const smoke = new THREE.Mesh(this.fireGeo, this.smokeMat);
      smoke.position.copy(position);
      smoke.scale.setScalar(1.2 + Math.random() * 1.8);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        4 + Math.random() * 10,
        (Math.random() - 0.5) * 8
      );

      this.particles.push({
        mesh: smoke,
        velocity: vel,
        life: 1.2 + Math.random() * 0.6,
        maxLife: 1.8,
        scaleDelta: 0.5,
        rotVelocity: new THREE.Vector3(Math.random() * 2, Math.random() * 2, 0),
      });
      this.scene.add(smoke);
    }
  }

  // Update projectiles & particles every frame
  public update(delta: number): void {
    // 1. Update Muzzle Flash Point Lights
    for (const flash of this.muzzleFlashLights) {
      if (flash.timer > 0) {
        flash.timer -= delta;
        if (flash.timer <= 0) {
          flash.light.intensity = 0;
        }
      }
    }

    // 2. Update Laser Projectiles
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b.active) {
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      const stepDist = b.velocity * delta;
      b.mesh.position.addScaledVector(b.direction, stepDist);
      b.distanceTraveled += stepDist;

      if (b.distanceTraveled >= b.maxDistance) {
        b.active = false;
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
      }
    }

    // 3. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= delta;

      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      // Physics: velocity + gravity
      p.velocity.y -= 12 * delta; // gravity
      p.mesh.position.addScaledVector(p.velocity, delta);

      // Rotation
      p.mesh.rotation.x += p.rotVelocity.x * delta;
      p.mesh.rotation.y += p.rotVelocity.y * delta;

      // Scale fade
      const progress = p.life / p.maxLife;
      const s = Math.max(0.01, progress * (1 + p.scaleDelta));
      p.mesh.scale.set(s, s, s);
    }
  }

  public clearAll(): void {
    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
    }
    this.bullets = [];

    for (const p of this.particles) {
      this.scene.remove(p.mesh);
    }
    this.particles = [];
  }
}
