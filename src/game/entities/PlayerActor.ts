import * as THREE from 'three';
import { CapsuleGeometry } from 'three/addons/geometries/CapsuleGeometry.js';
import type { PlayerProfile, TeamSide } from '../../shared/types';

export type Locomotion = 'idle' | 'walk' | 'run' | 'sprint' | 'dribble' | 'tackle' | 'celebrate';

export class PlayerActor {
  readonly profile: PlayerProfile;
  readonly side: TeamSide;
  readonly group = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly desired = new THREE.Vector3();
  readonly target = new THREE.Vector3();
  readonly colliderHalfHeight = 0.48;
  readonly colliderRadius = 0.28;
  stamina: number;
  yaw = 0;
  locomotion: Locomotion = 'idle';
  hasBall = false;
  private phase = Math.random() * Math.PI * 2;
  private readonly leftLeg: THREE.Group;
  private readonly rightLeg: THREE.Group;
  private readonly leftArm: THREE.Group;
  private readonly rightArm: THREE.Group;
  private readonly torso: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly neck: THREE.Mesh;
  private readonly shortsMesh: THREE.Mesh;
  private readonly leftBoot: THREE.Mesh;
  private readonly rightBoot: THREE.Mesh;
  private readonly trim: THREE.MeshStandardMaterial;

  constructor(profile: PlayerProfile, side: TeamSide, kitColor: string, trimColor: string, isUser: boolean) {
    this.profile = profile;
    this.side = side;
    this.stamina = profile.attributes.stamina;
    const kit = new THREE.MeshStandardMaterial({ color: kitColor, roughness: 0.72, metalness: 0.02 });
    const shorts = new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.82 });
    const skin = new THREE.MeshStandardMaterial({ color: this.skinTone(profile), roughness: 0.95 });
    const socks = new THREE.MeshStandardMaterial({ color: kitColor, roughness: 0.9 });
    const bootMat = new THREE.MeshStandardMaterial({ color: '#171d25', roughness: 0.45, metalness: 0.08 });
    this.trim = new THREE.MeshStandardMaterial({ color: '#e9f4f7', roughness: 0.75 });

    this.torso = new THREE.Mesh(new CapsuleGeometry(0.24, 0.36, 4, 8), kit);
    this.torso.position.y = 1.14; this.torso.scale.set(1, 1, 0.72); this.torso.castShadow = true;
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.018), this.trim); chest.position.set(0, 1.35, -0.176); this.group.add(chest);
    this.group.add(this.torso);

    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), skin);
    this.head.position.y = 1.64; this.head.castShadow = true; this.group.add(this.head);
    this.neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.1, 8), skin); this.neck.position.y = 1.48; this.group.add(this.neck);

    this.shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.2, 0.24), shorts);
    this.shortsMesh.position.y = 0.86; this.shortsMesh.castShadow = true; this.group.add(this.shortsMesh);
    this.leftLeg = this.createLeg(socks, bootMat, -0.105);
    this.rightLeg = this.createLeg(socks, bootMat, 0.105);
    this.leftArm = this.createArm(skin, kit, -0.29);
    this.rightArm = this.createArm(skin, kit, 0.29);
    this.group.add(this.leftLeg, this.rightLeg, this.leftArm, this.rightArm);

    const number = this.makeNumber(profile.number);
    number.position.set(0, 1.18, 0.177); number.rotation.y = Math.PI; this.group.add(number);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 4), new THREE.MeshBasicMaterial({ color: isUser ? '#ffdf68' : '#ffffff', transparent: true, opacity: isUser ? 0.96 : 0.6 }));
    marker.name = 'player-marker'; marker.position.set(0, 2.04, 0); marker.rotation.x = Math.PI; marker.visible = isUser; this.group.add(marker);
    this.group.userData.playerId = profile.id;
    this.group.traverse((object) => { if ((object as THREE.Mesh).isMesh) { const mesh = object as THREE.Mesh; mesh.castShadow = true; mesh.receiveShadow = false; } });
    // In first-person the own torso and face are hidden; the animated lower body remains visible.
    this.setFirstPerson(isUser);
  }

  private createLeg(socks: THREE.Material, boots: THREE.Material, x: number): THREE.Group {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.78, 0);
    const upper = new THREE.Mesh(new CapsuleGeometry(0.075, 0.26, 3, 7), socks); upper.position.y = -0.18;
    const lower = new THREE.Mesh(new CapsuleGeometry(0.06, 0.25, 3, 7), socks); lower.position.y = -0.48;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.25), boots); shoe.position.set(0, -0.66, -0.055);
    pivot.add(upper, lower, shoe); return pivot;
  }

  private createArm(skin: THREE.Material, kit: THREE.Material, x: number): THREE.Group {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.34, 0);
    const sleeve = new THREE.Mesh(new CapsuleGeometry(0.075, 0.22, 3, 7), kit); sleeve.position.y = -0.12;
    const forearm = new THREE.Mesh(new CapsuleGeometry(0.055, 0.19, 3, 7), skin); forearm.position.set(0, -0.34, 0.015);
    pivot.add(sleeve, forearm); return pivot;
  }

  private makeNumber(value: number): THREE.Group {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#ffffff'; ctx.font = 'bold 68px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(value), 64, 64); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), material);
    const group = new THREE.Group(); group.add(mesh); return group;
  }

  private skinTone(profile: PlayerProfile): string {
    const tones = ['#e5b78f', '#c88d68', '#9a674e', '#edcba8', '#744a3d', '#dba27b'];
    const code = profile.nationality.split('').reduce((a, c) => a + c.charCodeAt(0), profile.age);
    return tones[code % tones.length]!;
  }

  updateAnimation(dt: number, speed: number): void {
    this.phase += dt * (speed > 4.4 ? 13 : speed > 1.2 ? 8 : 2.2);
    const moving = speed > 0.25;
    const amplitude = moving ? Math.min(0.78, speed * 0.115) : 0.035;
    const swing = Math.sin(this.phase) * amplitude;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.58;
    this.rightArm.rotation.x = swing * 0.58;
    this.group.position.y = moving ? Math.abs(Math.cos(this.phase * 2)) * 0.045 : 0;
    if (this.locomotion === 'tackle') {
      this.leftLeg.rotation.x = -1.1; this.rightLeg.rotation.x = 0.2;
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, 0.45, 7, dt);
    } else {
      this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, 0, 8, dt);
    }
    if (this.hasBall && moving) this.group.position.y += Math.abs(Math.sin(this.phase * 0.5)) * 0.018;
  }

  setFirstPerson(enabled: boolean): void {
    this.torso.visible = !enabled; this.head.visible = !enabled; this.neck.visible = !enabled;
    this.shortsMesh.visible = !enabled; this.leftArm.visible = !enabled; this.rightArm.visible = !enabled;
  }

  setControlledMarker(enabled: boolean): void {
    const marker = this.group.getObjectByName('player-marker');
    if (marker) marker.visible = enabled;
  }
}
