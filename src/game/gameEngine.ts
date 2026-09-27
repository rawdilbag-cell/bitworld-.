import * as THREE from 'three';
import { createTerrain, TerrainResult, getTerrainHeight } from './terrain';
import { generateOutposts, OutpostCompound, checkStructureElevation } from './structures';
import { createTacticalDrone, DroneObject } from './droneModel';
import { StormZone } from './stormZone';
import { EnemyBot } from './botAI';
import { CombatEffectsSystem } from './effects';
import { sound } from './audio';

export interface GameHUDState {
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  ammo: number;
  maxAmmo: number;
  isReloading: boolean;
  weaponIndex: number; // 0: Pulse Carbine, 1: Heavy Railgun
  weaponName: string;
  isADS: boolean;
  isLocked: boolean;
  aliveCount: number;
  totalEnemies: number;
  playerKills: number;
  stormPhase: number;
  stormTimeRemaining: number;
  isStormShrinking: boolean;
  isInStorm: boolean;
  compassHeading: number; // 0 - 360 degrees
  playerPos: { x: number; y: number; z: number };
  stormCenter: { x: number; y: number };
  stormRadius: number;
  outpostPositions: { x: number; z: number }[];
  botRadarPositions: { x: number; z: number; isDead: boolean }[];
  killFeed: { id: string; killer: string; victim: string; isPlayerKill: boolean }[];
  isGameOver: boolean;
  isVictory: boolean;
  gameTime: number;
  damageDealt: number;
}

export class BattlegroundGameEngine {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animationFrameId: number | null = null;
  private lastTime = 0;

  // World objects
  private terrain: TerrainResult;
  private outposts: OutpostCompound[];
  private storm: StormZone;
  private effects: CombatEffectsSystem;
  private bots: EnemyBot[] = [];

  // Player state
  private playerDrone: DroneObject;
  private playerPos = new THREE.Vector3(0, 10, 0);
  private playerVelocity = new THREE.Vector3();
  private isGrounded = false;
  private playerHealth = 100;
  private maxHealth = 100;
  private playerShield = 100;
  private maxShield = 100;
  private kills = 0;
  private damageDealt = 0;
  private isGameOver = false;
  private isVictory = false;

  // Weapons & Ammo
  private currentWeapon = 0; // 0 = Pulse, 1 = Railgun
  private weaponConfigs = [
    { name: "TACTICAL PULSE RIFLE", maxAmmo: 30, fireRate: 0.12, damage: 22, reloadTime: 1.6 },
    { name: "HEAVY RAILGUN SNIPER", maxAmmo: 5, fireRate: 0.85, damage: 85, reloadTime: 2.2 },
  ];
  private ammo = 30;
  private isReloading = false;
  private reloadTimer = 0;
  private nextFireTime = 0;
  private muzzleToggle = false;

  // Controls & Camera
  private keys: { [key: string]: boolean } = {};
  private yaw = 0;
  private pitch = 0;
  private cameraOffset = new THREE.Vector3(0, 3.2, -6.5);
  private cameraAimOffset = new THREE.Vector3(1.2, 1.8, -3.2);
  private isADS = false;
  private isPointerLocked = false;
  private geigerTimer = 0;

  // Killfeed & UI state
  private killFeedList: GameHUDState['killFeed'] = [];
  private onHUDUpdate: ((state: GameHUDState) => void) | null = null;

  constructor(container: HTMLElement, onHUDUpdate?: (state: GameHUDState) => void) {
    this.container = container;
    this.onHUDUpdate = onHUDUpdate || null;

    // 1. Scene & Atmosphere (Requirement 4: 3D linear/exp2 fog)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x131d27);
    this.scene.fog = new THREE.FogExp2(0x182430, 0.0016);

    // 2. Camera (Third-Person Perspective)
    this.camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.1,
      3000
    );

    // 3. Renderer with ultra-realistic lighting & shadows (Requirement 1)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Ultra-Realistic Lighting Setup (Requirement 1)
    this.setupLighting();

    // 5. Sky Dome (Atmospheric horizon gradient)
    this.setupSkyDome();

    // 6. Massive Procedural Textured Terrain (Requirement 2)
    this.terrain = createTerrain(this.scene);

    // 7. Multi-Story Military Outposts (Requirement 3: 40 compounds)
    this.outposts = generateOutposts(this.scene, 40);

    // 8. Player Tactical Drone / Mech (Requirement 5)
    this.playerDrone = createTacticalDrone(true);
    // Find initial spawn near map center at appropriate ground height
    const initialH = getTerrainHeight(0, 0);
    this.playerPos.set(0, initialH + 2.5, 0);
    this.playerDrone.mesh.position.copy(this.playerPos);
    this.scene.add(this.playerDrone.mesh);

    // 9. Shrinking Radioactive Danger Zone (Requirement 7)
    this.storm = new StormZone(this.scene);

    // 10. Combat Effects System (Laser rounds, muzzle flash lights, particles)
    this.effects = new CombatEffectsSystem(this.scene);

    // 11. Spawn 25 Hostile Enemy AI Bots (Requirement 6)
    this.spawnEnemyBots(25);

    // 12. Input & Listeners
    this.setupEventListeners();

    // Start Main Loop
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  // Setup ultra-realistic lighting & shadows
  private setupLighting(): void {
    // Subtle HemisphereLight for realistic global environmental ambient lighting
    const hemiLight = new THREE.HemisphereLight(0xdfeaf5, 0x2e2922, 0.65);
    hemiLight.position.set(0, 600, 0);
    this.scene.add(hemiLight);

    // DirectionalLight acting as the sun casting high-res dynamic shadows
    const sunLight = new THREE.DirectionalLight(0xfff6e8, 2.2);
    sunLight.position.set(450, 750, 350);
    sunLight.castShadow = true;

    // High-resolution shadow map config
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 1600;

    // Shadow frustum volume
    const shadowD = 350;
    sunLight.shadow.camera.left = -shadowD;
    sunLight.shadow.camera.right = shadowD;
    sunLight.shadow.camera.top = shadowD;
    sunLight.shadow.camera.bottom = -shadowD;
    sunLight.shadow.bias = -0.0004;

    this.scene.add(sunLight);
  }

  // Atmospheric sky dome
  private setupSkyDome(): void {
    const skyGeo = new THREE.SphereGeometry(2200, 32, 24);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Horizon gradient from dark space to dusty haze
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0c1218'); // Zenith dark slate
    grad.addColorStop(0.55, '#1e2c3b'); // Mid blue-grey
    grad.addColorStop(0.85, '#404f5e'); // Horizon glow
    grad.addColorStop(1, '#2c3842'); // Low haze
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    const skyTex = new THREE.CanvasTexture(canvas);
    const skyMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
    });
    const skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyMesh);
  }

  // Spawn 25 aggressive AI bots distributed throughout the battleground
  private spawnEnemyBots(count: number): void {
    for (let i = 0; i < count; i++) {
      // Pick a location near an outpost or open hill
      let spawnPos = new THREE.Vector3();
      if (i < this.outposts.length && Math.random() > 0.3) {
        // Spawn near an outpost
        const op = this.outposts[i];
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetDist = 12 + Math.random() * 25;
        const x = op.position.x + Math.cos(offsetAngle) * offsetDist;
        const z = op.position.z + Math.sin(offsetAngle) * offsetDist;
        const y = getTerrainHeight(x, z) + 2.5;
        spawnPos.set(x, y, z);
      } else {
        // Random field spawn within battle circle
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 850;
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        const y = getTerrainHeight(x, z) + 2.5;
        spawnPos.set(x, y, z);
      }

      const bot = new EnemyBot(i + 1, spawnPos, this.scene);
      this.bots.push(bot);
    }
  }

  // Input & Pointer Lock setup
  private setupEventListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('resize', this.handleResize);

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    });
  }

  public requestPointerLock(): void {
    if (!this.isPointerLocked) {
      this.renderer.domElement.requestPointerLock();
    }
  }

  public unlockPointer(): void {
    if (this.isPointerLocked) {
      document.exitPointerLock();
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    this.keys[e.code] = true;

    // Weapon selection
    if (e.code === 'Digit1') {
      this.switchWeapon(0);
    } else if (e.code === 'Digit2') {
      this.switchWeapon(1);
    }

    // Reload
    if (e.code === 'KeyR' && !this.isReloading && this.ammo < this.weaponConfigs[this.currentWeapon].maxAmmo) {
      this.startReload();
    }

    // Jetpack jump sound
    if (e.code === 'Space' && this.isGrounded) {
      sound.playThruster();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys[e.code] = false;
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (!this.isPointerLocked) {
      this.requestPointerLock();
      return;
    }

    if (e.button === 0) {
      // Left-Click: Fire weapon
      this.fireWeapon();
    } else if (e.button === 2) {
      // Right-Click: Aim Down Sights (ADS)
      e.preventDefault();
      this.isADS = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) {
      this.isADS = false;
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked) return;

    const sensitivity = this.isADS ? 0.0012 : 0.0022;
    this.yaw -= e.movementX * sensitivity;
    this.pitch -= e.movementY * sensitivity;

    // Clamp pitch between -70 and +75 degrees
    const maxPitch = Math.PI * 0.38;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  };

  private handleResize = (): void => {
    if (!this.container) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  };

  public switchWeapon(index: number): void {
    if (index === this.currentWeapon || this.isReloading) return;
    this.currentWeapon = index;
    this.ammo = this.weaponConfigs[index].maxAmmo;
  }

  private startReload(): void {
    if (this.isReloading) return;
    this.isReloading = true;
    this.reloadTimer = this.weaponConfigs[this.currentWeapon].reloadTime;
    sound.playReload();
  }

  // Combat: Player weapon firing
  private fireWeapon(): void {
    if (this.isGameOver) return;
    const now = performance.now() * 0.001;
    const cfg = this.weaponConfigs[this.currentWeapon];

    if (now < this.nextFireTime) return;

    if (this.ammo <= 0) {
      this.startReload();
      return;
    }

    this.ammo--;
    this.nextFireTime = now + cfg.fireRate;
    this.muzzleToggle = !this.muzzleToggle;

    // Sound
    if (this.currentWeapon === 1) {
      sound.playRailgunShot();
    } else {
      sound.playPulseShot();
    }

    // Obtain muzzle world coordinate
    const muzzlePos = this.playerDrone.getMuzzleWorldPosition(this.muzzleToggle);

    // Compute firing direction from camera raycast through center of screen
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);

    // Spawn high-velocity laser projectile
    this.effects.spawnLaser(
      muzzlePos,
      dir,
      true,
      this.currentWeapon === 1,
      "PLAYER"
    );
  }

  // Handle enemy bot bullet firing request
  private handleBotShoot = (bullet: { origin: THREE.Vector3; direction: THREE.Vector3; shooterName: string }): void => {
    this.effects.spawnLaser(
      bullet.origin,
      bullet.direction,
      false,
      false,
      bullet.shooterName
    );
  };

  // Main Game Loop
  private loop = (time: number): void => {
    this.animationFrameId = requestAnimationFrame(this.loop);

    const delta = Math.min((time - this.lastTime) * 0.001, 0.1);
    this.lastTime = time;

    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  };

  private update(delta: number): void {
    if (this.isGameOver) return;

    // 1. Reload Timer
    if (this.isReloading) {
      this.reloadTimer -= delta;
      if (this.reloadTimer <= 0) {
        this.isReloading = false;
        this.ammo = this.weaponConfigs[this.currentWeapon].maxAmmo;
      }
    }

    // 2. Player Controls & Physics
    this.updatePlayerMovement(delta);

    // 3. Smooth Lerped Third-Person Camera (Requirement 5)
    this.updateCamera(delta);

    // 4. Update Storm Zone (Requirement 7)
    this.storm.update(delta);

    // Check storm radiation damage to player
    const playerInStorm = this.storm.isOutside(this.playerPos.x, this.playerPos.z);
    if (playerInStorm) {
      const stormDmg = this.storm.state.damagePerSec * delta;
      this.applyPlayerDamage(stormDmg, "RADIOACTIVE STORM");

      this.geigerTimer -= delta;
      if (this.geigerTimer <= 0) {
        sound.playGeigerTick();
        this.geigerTimer = 0.2 + Math.random() * 0.25;
      }
    }

    // 5. Update Enemy AI Bots (Requirement 6)
    let aliveBotCount = 0;
    for (const bot of this.bots) {
      if (!bot.isDead) {
        aliveBotCount++;
        bot.update(delta, this.playerPos, this.outposts, this.handleBotShoot);

        // Bots take damage outside storm zone
        if (this.storm.isOutside(bot.position.x, bot.position.z)) {
          const killed = bot.takeDamage(this.storm.state.damagePerSec * delta * 0.8, false);
          if (killed) {
            this.effects.createBotExplosion(bot.position);
            sound.playExplosion(0.4);
            this.addKillFeed("RADIOACTIVE STORM", bot.name, false);
          }
        }
      }
    }

    // Check Victory Condition
    if (aliveBotCount === 0 && !this.isGameOver) {
      this.isVictory = true;
      this.isGameOver = true;
      sound.playVictory();
    }

    // 6. Update Projectiles & Check Raycast Collisions
    this.updateProjectiles();

    // 7. Update Particles & Muzzle Flash Lights
    this.effects.update(delta);

    // 8. Shield slow regeneration when not under fire
    if (this.playerShield < this.maxShield && !playerInStorm) {
      this.playerShield = Math.min(this.maxShield, this.playerShield + delta * 8);
    }

    // 9. Emit HUD State
    this.emitHUDUpdate(aliveBotCount, playerInStorm);
  }

  // Player movement, jetpack, and collision resolution
  private updatePlayerMovement(delta: number): void {
    let forward = 0;
    let strafe = 0;

    if (this.keys['KeyW']) forward += 1;
    if (this.keys['KeyS']) forward -= 1;
    if (this.keys['KeyA']) strafe -= 1;
    if (this.keys['KeyD']) strafe += 1;

    const isSprinting = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const baseSpeed = this.isADS ? 12 : isSprinting ? 32 : 20;

    // Movement relative to camera yaw
    const forwardVec = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const rightVec = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3()
      .addScaledVector(forwardVec, forward)
      .addScaledVector(rightVec, strafe);

    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
    }

    // Jetpack & Jump
    const jumpPower = 22;
    if (this.keys['Space']) {
      if (this.isGrounded) {
        this.playerVelocity.y = jumpPower;
        this.isGrounded = false;
      } else if (this.playerVelocity.y < 16) {
        // Sustained hover boost
        this.playerVelocity.y += 35 * delta;
      }
    }

    // Apply gravity
    this.playerVelocity.y -= 38 * delta;

    // Apply horizontal velocity with snappy damping
    this.playerVelocity.x = THREE.MathUtils.lerp(this.playerVelocity.x, moveDir.x * baseSpeed, 0.2);
    this.playerVelocity.z = THREE.MathUtils.lerp(this.playerVelocity.z, moveDir.z * baseSpeed, 0.2);

    // Proposed new position
    this.playerPos.x += this.playerVelocity.x * delta;
    this.playerPos.z += this.playerVelocity.z * delta;
    this.playerPos.y += this.playerVelocity.y * delta;

    // Map Boundaries (-1240 to +1240)
    const mapLimit = 1220;
    this.playerPos.x = Math.max(-mapLimit, Math.min(mapLimit, this.playerPos.x));
    this.playerPos.z = Math.max(-mapLimit, Math.min(mapLimit, this.playerPos.z));

    // Collision with Multi-Story Outpost Walls
    for (const c of this.outposts) {
      if (Math.hypot(this.playerPos.x - c.position.x, this.playerPos.z - c.position.z) < c.width / 2 + 3) {
        for (const box of c.obstacleBoxes) {
          if (box.containsPoint(this.playerPos)) {
            const push = new THREE.Vector3().subVectors(this.playerPos, c.position).setY(0).normalize();
            this.playerPos.addScaledVector(push, 2.5);
          }
        }
      }
    }

    // Elevation resolving: Check whether player is on an Outpost Floor/Roof OR Terrain
    const structureElev = checkStructureElevation(this.playerPos.x, this.playerPos.y, this.playerPos.z, this.outposts);
    const terrainElev = getTerrainHeight(this.playerPos.x, this.playerPos.z);
    const groundLevel = (structureElev !== null ? structureElev : terrainElev) + 1.6;

    if (this.playerPos.y <= groundLevel) {
      this.playerPos.y = groundLevel;
      this.playerVelocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // Drone mesh matches player position & yaw
    this.playerDrone.mesh.position.copy(this.playerPos);
    this.playerDrone.mesh.rotation.y = this.yaw + Math.PI;

    // Hover tilt & banking animation
    this.playerDrone.updateHover(performance.now() * 0.001, moveDir.lengthSq() > 0.01, strafe, forward);
  }

  // Smooth lerped Third-Person Camera locked tightly behind player
  private updateCamera(delta: number): void {
    // Target camera offset depending on ADS mode
    const baseOffset = this.isADS ? this.cameraAimOffset : this.cameraOffset;

    // Rotate camera offset by yaw and pitch
    const rotatedOffset = baseOffset.clone();
    rotatedOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    rotatedOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

    const targetCameraPos = this.playerPos.clone().add(rotatedOffset);

    // Prevent camera clipping below terrain
    const minCameraY = getTerrainHeight(targetCameraPos.x, targetCameraPos.z) + 1.2;
    if (targetCameraPos.y < minCameraY) {
      targetCameraPos.y = minCameraY;
    }

    // Smooth lerp camera position
    const lerpSpeed = this.isADS ? 0.35 : 0.22;
    this.camera.position.lerp(targetCameraPos, lerpSpeed);

    // Look at point: In front of drone
    const lookTarget = this.playerPos.clone().add(new THREE.Vector3(
      -Math.sin(this.yaw) * 40 * Math.cos(this.pitch),
      Math.sin(this.pitch) * 40 + 1.2,
      -Math.cos(this.yaw) * 40 * Math.cos(this.pitch)
    ));
    this.camera.lookAt(lookTarget);

    // ADS dynamic FOV
    const targetFov = this.isADS ? 45 : 72;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.18);
    this.camera.updateProjectionMatrix();
  }

  // Projectile simulation & Raycast Collision against terrain, buildings, bots, and player
  private updateProjectiles(): void {
    for (const b of this.effects.bullets) {
      if (!b.active) continue;

      const bulletPos = b.mesh.position;

      // 1. Terrain Collision
      const terrY = getTerrainHeight(bulletPos.x, bulletPos.z);
      if (bulletPos.y <= terrY) {
        b.active = false;
        this.effects.createImpactSparks(bulletPos, new THREE.Vector3(0, 1, 0));
        continue;
      }

      // 2. Outpost Obstacle Collision
      for (const op of this.outposts) {
        if (Math.hypot(bulletPos.x - op.position.x, bulletPos.z - op.position.z) < op.width) {
          for (const box of op.obstacleBoxes) {
            if (box.containsPoint(bulletPos)) {
              b.active = false;
              this.effects.createImpactSparks(bulletPos, new THREE.Vector3(0, 1, 0));
              break;
            }
          }
        }
        if (!b.active) break;
      }
      if (!b.active) continue;

      // 3. Player Hit by Enemy Bot
      if (!b.isPlayer && !this.isGameOver) {
        const distToPlayer = bulletPos.distanceTo(this.playerPos);
        if (distToPlayer < 2.0) {
          b.active = false;
          this.applyPlayerDamage(b.damage, b.shooterName);
          this.effects.createImpactSparks(bulletPos, b.direction.clone().negate(), true);
          continue;
        }
      }

      // 4. Enemy Bot Hit by Player Bullet
      if (b.isPlayer) {
        for (const bot of this.bots) {
          if (bot.isDead) continue;
          const distToBot = bulletPos.distanceTo(bot.position);
          if (distToBot < 2.4) {
            b.active = false;
            this.damageDealt += b.damage;
            const killed = bot.takeDamage(b.damage, true);
            this.effects.createImpactSparks(bulletPos, b.direction.clone().negate(), true);

            if (killed) {
              this.kills++;
              this.effects.createBotExplosion(bot.position);
              sound.playExplosion(1.0);
              this.addKillFeed("YOU", bot.name, true);
            }
            break;
          }
        }
      }
    }
  }

  // Damage logic for player
  public applyPlayerDamage(amount: number, source: string): void {
    if (this.isGameOver) return;

    if (this.playerShield > 0) {
      this.playerShield -= amount;
      sound.playHit(true);
      if (this.playerShield < 0) {
        this.playerHealth += this.playerShield;
        this.playerShield = 0;
      }
    } else {
      this.playerHealth -= amount;
      sound.playHit(false);
    }

    if (this.playerHealth <= 0) {
      this.playerHealth = 0;
      this.isGameOver = true;
      this.isVictory = false;
      this.effects.createBotExplosion(this.playerPos);
      sound.playExplosion(1.0);
      this.addKillFeed(source, "YOU", false);
    }
  }

  private addKillFeed(killer: string, victim: string, isPlayerKill: boolean): void {
    const item = {
      id: Math.random().toString(36).substring(2, 9),
      killer,
      victim,
      isPlayerKill,
    };
    this.killFeedList.unshift(item);
    if (this.killFeedList.length > 5) {
      this.killFeedList.pop();
    }
  }

  // Publish updated state to React tactical HUD
  private emitHUDUpdate(aliveBots: number, inStorm: boolean): void {
    if (!this.onHUDUpdate) return;

    // Convert yaw to compass bearing degrees (0 = North, 90 = East, 180 = South, 270 = West)
    let heading = ((-this.yaw * 180) / Math.PI) % 360;
    if (heading < 0) heading += 360;

    const state: GameHUDState = {
      health: Math.round(this.playerHealth),
      maxHealth: this.maxHealth,
      shield: Math.round(this.playerShield),
      maxShield: this.maxShield,
      ammo: this.ammo,
      maxAmmo: this.weaponConfigs[this.currentWeapon].maxAmmo,
      isReloading: this.isReloading,
      weaponIndex: this.currentWeapon,
      weaponName: this.weaponConfigs[this.currentWeapon].name,
      isADS: this.isADS,
      isLocked: this.isPointerLocked,
      aliveCount: aliveBots + (this.isGameOver && !this.isVictory ? 0 : 1),
      totalEnemies: this.bots.length,
      playerKills: this.kills,
      stormPhase: this.storm.state.phase,
      stormTimeRemaining: Math.max(0, Math.ceil(this.storm.state.timeRemaining)),
      isStormShrinking: this.storm.state.isShrinking,
      isInStorm: inStorm,
      compassHeading: Math.round(heading),
      playerPos: { x: this.playerPos.x, y: this.playerPos.y, z: this.playerPos.z },
      stormCenter: { x: this.storm.state.center.x, y: this.storm.state.center.y },
      stormRadius: this.storm.state.currentRadius,
      outpostPositions: this.outposts.map(o => ({ x: o.position.x, z: o.position.z })),
      botRadarPositions: this.bots.map(b => ({ x: b.position.x, z: b.position.z, isDead: b.isDead })),
      killFeed: [...this.killFeedList],
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      gameTime: Math.floor(performance.now() * 0.001),
      damageDealt: Math.round(this.damageDealt),
    };

    this.onHUDUpdate(state);
  }

  // Restart match
  public restart(): void {
    this.isGameOver = false;
    this.isVictory = false;
    this.playerHealth = 100;
    this.playerShield = 100;
    this.kills = 0;
    this.damageDealt = 0;
    this.ammo = this.weaponConfigs[this.currentWeapon].maxAmmo;
    this.isReloading = false;

    // Reset player position
    const initH = getTerrainHeight(0, 0);
    this.playerPos.set(0, initH + 2.5, 0);
    this.playerVelocity.set(0, 0, 0);
    this.playerDrone.mesh.position.copy(this.playerPos);

    // Clean up bots & respawn
    for (const b of this.bots) {
      b.cleanup(this.scene);
    }
    this.bots = [];
    this.spawnEnemyBots(25);

    // Reset Storm
    this.scene.remove(this.storm.mesh);
    this.storm = new StormZone(this.scene);

    // Reset effects
    this.effects.clearAll();
    this.killFeedList = [];
  }

  public dispose(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('resize', this.handleResize);

    this.renderer.dispose();
    if (this.container && this.renderer.domElement) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
