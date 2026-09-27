import * as THREE from 'three';

export interface StormState {
  currentRadius: number;
  targetRadius: number;
  phase: number;
  maxPhases: number;
  timeRemaining: number;
  isShrinking: boolean;
  center: THREE.Vector2;
  nextCenter: THREE.Vector2;
  damagePerSec: number;
}

export class StormZone {
  public mesh: THREE.Mesh;
  public state: StormState;
  private texture: THREE.CanvasTexture;
  private material: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.state = {
      currentRadius: 1200,
      targetRadius: 750,
      phase: 1,
      maxPhases: 4,
      timeRemaining: 45, // 45s until first shrink
      isShrinking: false,
      center: new THREE.Vector2(0, 0),
      nextCenter: new THREE.Vector2(50, -40),
      damagePerSec: 6,
    };

    // Procedural Glowing Storm Grid Texture
    this.texture = this.createStormTexture();

    const geometry = new THREE.CylinderGeometry(
      this.state.currentRadius,
      this.state.currentRadius,
      600,
      64,
      1,
      true // open-ended cylinder
    );

    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.set(0, 200, 0);
    this.mesh.name = "StormZoneCylinder";
    scene.add(this.mesh);
  }

  private createStormTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = 'rgba(0, 20, 40, 0.2)';
    ctx.fillRect(0, 0, 512, 512);

    // Glowing vertical laser scanlines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.lineWidth = 2;
    for (let x = 0; x < 512; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }

    // Horizontal energy rings
    for (let y = 0; y < 512; y += 48) {
      ctx.strokeStyle = 'rgba(0, 210, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Hexagonal matrix pattern
    ctx.strokeStyle = 'rgba(125, 235, 255, 0.3)';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 512; y += 64) {
      for (let x = 0; x < 512; x += 64) {
        ctx.strokeRect(x + 8, y + 8, 48, 48);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(16, 2);
    return tex;
  }

  public update(delta: number): void {
    // Scroll texture for electric flowing animation
    this.texture.offset.y += delta * 0.12;
    this.texture.offset.x += delta * 0.04;

    // Pulse opacity
    this.material.opacity = 0.38 + Math.sin(performance.now() * 0.003) * 0.12;

    this.state.timeRemaining -= delta;

    if (this.state.timeRemaining <= 0) {
      if (!this.state.isShrinking) {
        // Transition from wait to shrinking
        this.state.isShrinking = true;
        this.state.timeRemaining = 40; // 40 seconds duration of shrinking
      } else {
        // Transition to next phase
        this.state.isShrinking = false;
        this.state.phase++;
        this.state.damagePerSec += 4; // Increases each phase

        if (this.state.phase === 2) {
          this.state.targetRadius = 450;
          this.state.timeRemaining = 45;
          this.state.nextCenter = new THREE.Vector2(-80, 60);
        } else if (this.state.phase === 3) {
          this.state.targetRadius = 220;
          this.state.timeRemaining = 35;
          this.state.nextCenter = new THREE.Vector2(20, 30);
        } else if (this.state.phase >= 4) {
          this.state.targetRadius = 60;
          this.state.timeRemaining = 30;
          this.state.nextCenter = new THREE.Vector2(0, 0);
        }
      }
    }

    // Shrinking interpolation
    if (this.state.isShrinking) {
      const shrinkSpeed = 16 * delta; // units per second
      if (this.state.currentRadius > this.state.targetRadius) {
        this.state.currentRadius = Math.max(
          this.state.targetRadius,
          this.state.currentRadius - shrinkSpeed
        );

        // Interpolate center toward nextCenter
        this.state.center.lerp(this.state.nextCenter, 0.005);
      }
    }

    // Update cylinder scale to match radius
    const scale = this.state.currentRadius / 1200;
    this.mesh.scale.set(scale, 1, scale);
    this.mesh.position.set(this.state.center.x, 200, this.state.center.y);
  }

  // Check if a point (x, z) is outside safe zone
  public isOutside(x: number, z: number): boolean {
    const dist = Math.hypot(x - this.state.center.x, z - this.state.center.y);
    return dist > this.state.currentRadius;
  }

  // Distance from edge (positive = inside, negative = in storm)
  public distanceToStormWall(x: number, z: number): number {
    const dist = Math.hypot(x - this.state.center.x, z - this.state.center.y);
    return this.state.currentRadius - dist;
  }
}
