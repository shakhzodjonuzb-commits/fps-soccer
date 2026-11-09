import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PlayerActor } from '../entities/PlayerActor';
import { FIELD } from '../stadium/field';

const FIXED_DT = 1 / 60;

export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly ballBody: RAPIER.RigidBody;
  readonly ballCollider: RAPIER.Collider;
  private readonly playerBodies = new Map<string, RAPIER.RigidBody>();
  private accumulator = 0;
  private readonly maxSubsteps = 4;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(90, 0.25, 75).setFriction(0.95).setRestitution(0.18), groundBody);
    this.addGoals();
    this.ballBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.23, 0).setLinearDamping(0.12).setAngularDamping(0.16).setCcdEnabled(true),
    );
    this.ballCollider = this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.22).setRestitution(0.52).setFriction(0.52).setDensity(0.43), this.ballBody,
    );
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  addPlayer(actor: PlayerActor): void {
    const p = actor.group.position;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, 0.9, p.z),
    );
    this.world.createCollider(RAPIER.ColliderDesc.capsule(0.45, 0.27).setFriction(0).setRestitution(0), body);
    this.playerBodies.set(actor.profile.id, body);
  }

  syncPlayers(actors: PlayerActor[]): void {
    for (const actor of actors) {
      const body = this.playerBodies.get(actor.profile.id);
      if (!body) continue;
      body.setNextKinematicTranslation({ x: actor.group.position.x, y: 0.9, z: actor.group.position.z });
    }
  }

  step(frameDt: number): void {
    this.accumulator = Math.min(this.accumulator + Math.min(frameDt, 0.08), FIXED_DT * this.maxSubsteps);
    while (this.accumulator >= FIXED_DT) {
      this.world.step();
      this.accumulator -= FIXED_DT;
    }
  }

  interpolateBall(target: THREE.Vector3): THREE.Vector3 {
    const pos = this.ballBody.translation();
    target.set(pos.x, pos.y, pos.z);
    return target;
  }

  velocity(target: THREE.Vector3): THREE.Vector3 {
    const v = this.ballBody.linvel();
    target.set(v.x, v.y, v.z);
    return target;
  }

  kick(direction: THREE.Vector3, power: number, lift = 0): void {
    const dir = direction.clone().normalize();
    this.ballBody.applyImpulse({ x: dir.x * power, y: Math.max(0, lift) + Math.max(0, dir.y * power), z: dir.z * power }, true);
    const spin = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(power * 0.035);
    this.ballBody.applyTorqueImpulse({ x: spin.x, y: 0, z: spin.z }, true);
  }

  resetBall(x = 0, z = 0): void {
    this.ballBody.setTranslation({ x, y: 0.24, z }, true);
    this.ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  getBallSpeed(): number {
    const v = this.ballBody.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  addBallSpin(): void {
    const v = this.ballBody.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (speed > 4) this.ballBody.applyImpulse({ x: -v.z * 0.0007, y: 0, z: v.x * 0.0007 }, true);
  }

  isGoal(): 'home' | 'away' | null {
    const { x, y, z } = this.ballBody.translation();
    if (Math.abs(z) > FIELD.goalWidth / 2 - 0.15 || y > FIELD.goalHeight + 0.25 || y < 0) return null;
    if (x > FIELD.halfLength + 0.3) return 'home';
    if (x < -FIELD.halfLength - 0.3) return 'away';
    return null;
  }

  isOutOfBounds(): boolean {
    const p = this.ballBody.translation();
    const inGoalMouth = Math.abs(p.z) < FIELD.goalWidth / 2 && p.y < FIELD.goalHeight + 0.25;
    if (Math.abs(p.x) > FIELD.halfLength + 1 && !inGoalMouth) return true;
    return Math.abs(p.z) > FIELD.halfWidth + 1;
  }

  ballPosition(): THREE.Vector3 {
    const p = this.ballBody.translation();
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  dispose(): void {
    this.world.free();
    this.playerBodies.clear();
  }

  private addGoals(): void {
    for (const side of [-1, 1]) {
      const x = side * FIELD.halfLength;
      for (const z of [-FIELD.goalWidth / 2, FIELD.goalWidth / 2]) {
        const post = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, FIELD.goalHeight / 2, z));
        this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, FIELD.goalHeight / 2, 0.08).setRestitution(0.7), post);
      }
      const bar = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, FIELD.goalHeight, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, 0.08, FIELD.goalWidth / 2).setRestitution(0.72), bar);
      const back = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x + side * 2.05, FIELD.goalHeight / 2, 0));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.08, FIELD.goalHeight / 2, FIELD.goalWidth / 2).setRestitution(0.36), back);
    }
  }
}
