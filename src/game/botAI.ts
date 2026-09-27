import * as THREE from 'three';
import { createTacticalDrone, DroneObject } from './droneModel';
import { getTerrainHeight } from './terrain';
import { OutpostCompound, checkStructureElevation } from './structures';
import { sound } from './audio';

export type BotState = 'PATROL' | 'HUNT' | 'ENGAGE' | 'TAKE_COVER' | 'DEAD';

const BOT_CALLSIGNS = [
  "VIPER-01", "PHANTOM-02", "TITAN-03", "GHOST-04", "REAPER-05",
  "APEX-06", "HAWK-07", "RAZOR-08", "STRIKER-09", "HUNTER-10",
  "CYCLOPS-11", "VORTEX-12", "ECLIPSE-13", "WARHOUND-14", "HYDRA-15",
  "SPECTRE-16", "NEXUS-17", "TALON-18", "DRAKE-19", "FALCON-20",
  "IRONCLAD-21", "TEMPEST-22", "AEGIS-23", "COBRA-24", "BERSERKER-25"
];

export interface BotBulletRequest {
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  shooterName: string;
}

export class EnemyBot {
  public id: number;
  public name: string;
  public drone: DroneObject;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3;
  public state: BotState = 'PATROL';
  public health = 100;
  public maxHealth = 100;
  public shield = 50;
  public maxShield = 50;
  public isDead = false;

  private targetPosition: THREE.Vector3;
  private patrolWaypoint: THREE.Vector3;
  private shootCooldown = 0;
  private burstCount = 0;
  private burstTimer = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private hitFlashTimer = 0;
  private coverCooldown = 0;

  constructor(id: number, spawnPos: THREE.Vector3, scene: THREE.Scene) {
    this.id = id;
    this.name = BOT_CALLSIGNS[id % BOT_CALLSIGNS.length];
    this.position = spawnPos.clone();
    this.velocity = new THREE.Vector3();
    this.targetPosition = spawnPos.clone();
    this.patrolWaypoint = this.getRandomWaypoint(spawnPos, 80);

    this.drone = createTacticalDrone(false);
    this.drone.mesh.position.copy(this.position);
    scene.add(this.drone.mesh);
  }

  private getRandomWaypoint(center: THREE.Vector3, radius: number): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const r = 20 + Math.random() * radius;
    const x = center.x + Math.cos(angle) * r;
    const z = center.z + Math.sin(angle) * r;
    const y = getTerrainHeight(x, z) + 3.0;
    return new THREE.Vector3(x, y, z);
  }

  public takeDamage(amount: number, shooterIsPlayer = true): boolean {
    if (this.isDead) return false;

    // Shield absorbs first
    if (this.shield > 0) {
      this.shield -= amount;
      sound.playHit(true);
      if (this.shield < 0) {
        this.health += this.shield; // overflow damage to health
        this.shield = 0;
      }
    } else {
      this.health -= amount;
      sound.playHit(false);
    }

    this.hitFlashTimer = 0.15;
    this.drone.coreMaterial.color.setHex(0xffffff);

    // If critically damaged, prioritize taking cover
    if (this.health < 45 && this.state !== 'TAKE_COVER') {
      this.state = 'TAKE_COVER';
      this.coverCooldown = 5.0; // Seek cover for 5 seconds
    } else if (this.state === 'PATROL') {
      this.state = 'HUNT';
    }

    if (this.health <= 0) {
      this.health = 0;
      this.isDead = true;
      this.state = 'DEAD';
      return true; // was killed by this hit
    }
    return false;
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    compounds: OutpostCompound[],
    onShoot: (bullet: BotBulletRequest) => void
  ): void {
    if (this.isDead) {
      this.drone.mesh.visible = false;
      return;
    }

    // Flash recovery
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      if (this.hitFlashTimer <= 0) {
        this.drone.coreMaterial.color.setHex(0xef4444);
      }
    }

    const distToPlayer = this.position.distanceTo(playerPos);

    // State Transitions
    if (this.state === 'TAKE_COVER') {
      this.coverCooldown -= delta;
      if (this.coverCooldown <= 0) {
        this.state = distToPlayer < 90 ? 'ENGAGE' : 'HUNT';
      }
    } else if (distToPlayer < 95) {
      this.state = 'ENGAGE';
    } else if (distToPlayer < 180) {
      this.state = 'HUNT';
    } else {
      this.state = 'PATROL';
    }

    // Shield slow regeneration when not under attack
    if (this.shield < this.maxShield && this.state !== 'ENGAGE') {
      this.shield = Math.min(this.maxShield, this.shield + delta * 6);
    }

    // Movement & Combat execution
    const moveDir = new THREE.Vector3();
    let moveSpeed = 14;

    switch (this.state) {
      case 'PATROL': {
        const distToWp = this.position.distanceTo(this.patrolWaypoint);
        if (distToWp < 5) {
          this.patrolWaypoint = this.getRandomWaypoint(this.position, 120);
        }
        moveDir.subVectors(this.patrolWaypoint, this.position).normalize();
        moveSpeed = 10;
        break;
      }

      case 'HUNT': {
        // Move purposefully toward player's flank
        moveDir.subVectors(playerPos, this.position).normalize();
        moveSpeed = 16;
        break;
      }

      case 'ENGAGE': {
        // Face player, strafe left/right unpredictably, maintain ~35m combat distance
        this.strafeTimer -= delta;
        if (this.strafeTimer <= 0) {
          this.strafeDir *= -1;
          this.strafeTimer = 1.2 + Math.random() * 2.0;
        }

        const toPlayer = new THREE.Vector3().subVectors(playerPos, this.position).normalize();
        const lateral = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).multiplyScalar(this.strafeDir);

        if (distToPlayer > 45) {
          // Approach
          moveDir.addVectors(toPlayer.multiplyScalar(0.7), lateral.multiplyScalar(0.5)).normalize();
        } else if (distToPlayer < 25) {
          // Back up
          moveDir.addVectors(toPlayer.multiplyScalar(-0.8), lateral.multiplyScalar(0.6)).normalize();
        } else {
          // Pure circle strafe
          moveDir.copy(lateral);
        }
        moveSpeed = 18;

        // Firing Logic
        this.handleCombatShooting(delta, playerPos, onShoot);
        break;
      }

      case 'TAKE_COVER': {
        // Find nearest outpost or retreat backwards behind ridge
        let nearestCompound = compounds[0];
        let minDist = 9999;
        for (const c of compounds) {
          const d = this.position.distanceTo(c.position);
          if (d < minDist) {
            minDist = d;
            nearestCompound = c;
          }
        }

        if (nearestCompound && minDist < 140) {
          // Retreat to opposite side of compound relative to player
          const dirFromPlayer = new THREE.Vector3().subVectors(nearestCompound.position, playerPos).normalize();
          const coverSpot = nearestCompound.position.clone().add(dirFromPlayer.multiplyScalar(nearestCompound.width / 2 + 5));
          moveDir.subVectors(coverSpot, this.position).normalize();
        } else {
          // Back away from player behind terrain
          moveDir.subVectors(this.position, playerPos).normalize();
        }
        moveSpeed = 22; // Sprint to cover
        break;
      }
    }

    // Apply movement
    this.velocity.x = moveDir.x * moveSpeed;
    this.velocity.z = moveDir.z * moveSpeed;

    this.position.x += this.velocity.x * delta;
    this.position.z += this.velocity.z * delta;

    // Obstacle avoidance against outpost walls
    for (const c of compounds) {
      if (Math.hypot(this.position.x - c.position.x, this.position.z - c.position.z) < c.width / 2 + 3) {
        for (const box of c.obstacleBoxes) {
          if (box.containsPoint(this.position)) {
            // Push out
            const push = new THREE.Vector3().subVectors(this.position, c.position).setY(0).normalize();
            this.position.addScaledVector(push, 2.5);
          }
        }
      }
    }

    // Vertical positioning (Terrain vs Structure Rooftop/Floor)
    const structureY = checkStructureElevation(this.position.x, this.position.y, this.position.z, compounds);
    const groundY = getTerrainHeight(this.position.x, this.position.z);
    const targetY = (structureY !== null ? structureY : groundY) + 2.4;

    this.position.y = THREE.MathUtils.lerp(this.position.y, targetY, 0.15);
    this.drone.mesh.position.copy(this.position);

    // Rotation / Aiming
    if (this.state === 'ENGAGE' || this.state === 'HUNT') {
      const aimTarget = playerPos.clone();
      aimTarget.y = this.position.y;
      this.drone.mesh.lookAt(aimTarget);
    } else if (moveDir.lengthSq() > 0.01) {
      const lookTarget = this.position.clone().add(moveDir);
      lookTarget.y = this.position.y;
      this.drone.mesh.lookAt(lookTarget);
    }

    // Visual hover animation
    this.drone.updateHover(performance.now() * 0.001, moveDir.lengthSq() > 0.1, this.strafeDir, 0.5);
  }

  private handleCombatShooting(
    delta: number,
    playerPos: THREE.Vector3,
    onShoot: (bullet: BotBulletRequest) => void
  ) {
    this.shootCooldown -= delta;

    if (this.shootCooldown <= 0) {
      // Fire a rapid burst of 2-3 laser shots
      this.burstCount = 3;
      this.burstTimer = 0.09;
      this.shootCooldown = 1.3 + Math.random() * 0.8;
    }

    if (this.burstCount > 0) {
      this.burstTimer -= delta;
      if (this.burstTimer <= 0) {
        this.burstCount--;
        this.burstTimer = 0.11;

        // Firing spread based on distance
        const isRightMuzzle = this.burstCount % 2 === 0;
        const origin = this.drone.getMuzzleWorldPosition(isRightMuzzle);

        const aimPoint = playerPos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.8,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.8
        ));

        const direction = new THREE.Vector3().subVectors(aimPoint, origin).normalize();

        onShoot({
          origin,
          direction,
          shooterName: this.name,
        });

        // Spatial sound attenuation
        const dist = this.position.distanceTo(playerPos);
        const distFactor = Math.max(0.05, 1 - dist / 160);
        sound.playBotShot(distFactor);
      }
    }
  }

  public cleanup(scene: THREE.Scene) {
    scene.remove(this.drone.mesh);
  }
}
