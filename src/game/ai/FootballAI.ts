// Fayl: src/game/ai/FootballAI.ts

import * as THREE from 'three';
import type { PlayerActor } from '../entities/PlayerActor';
import type { Difficulty, TacticalStyle, TeamSide } from '../../shared/types';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { getFormation } from '../match/formation';

export class FootballAI {
  private thinkTimer = 0;
  private readonly scratch = new THREE.Vector3();
  private readonly sideCache = new Map<TeamSide, PlayerActor[]>();

  constructor(
    private readonly actors: PlayerActor[],
    private readonly physics: PhysicsWorld,
    private readonly formations: { home: string; away: string },
    private readonly tactics: { home: TacticalStyle; away: TacticalStyle },
    private readonly difficulty: Difficulty,
    private readonly onShot?: (side: TeamSide) => void,
  ) {
    this.sideCache.set('home', actors.filter((player) => player.side === 'home'));
    this.sideCache.set('away', actors.filter((player) => player.side === 'away'));
  }

  update(dt: number, controlled: PlayerActor): void {
    this.thinkTimer -= dt;
    const ball = this.physics.ballPosition();

    if (this.thinkTimer <= 0) {
      this.thinkTimer = this.difficulty === 'hard'
        ? 0.11
        : this.difficulty === 'normal'
          ? 0.16
          : 0.23;
      this.decide(ball, controlled);
    }

    for (const actor of this.actors) {
      if (actor === controlled) continue;
      this.moveActor(actor, dt, ball, controlled);
    }
  }

  private decide(ball: THREE.Vector3, controlled: PlayerActor): void {
    const home = this.sideCache.get('home')!;
    const away = this.sideCache.get('away')!;
    const ballVelocity = this.physics.velocity(new THREE.Vector3());
    const controlledSide = controlled.side;

    // closestToBall() TeamSide qabul qiladi; bu yerda jamoa massivini uzatmaslik kerak.
    const attacking = this.closestToBall('home', ball);
    const defending = this.closestToBall('away', ball);

    for (const actor of [...home, ...away]) {
      if (actor === controlled) continue;

      const teamHasBall = actor.side === controlledSide
        ? controlled.hasBall || this.teamNearest(actor.side, ball)?.hasBall === true
        : actor.side === 'home'
          ? attacking.hasBall
          : defending.hasBall;

      const nearest = this.closestToBall(actor.side, ball);
      const isPressing = nearest === actor
        || actor.profile.position === 'ST'
        || actor.profile.position === 'AM';
      const formation = getFormation(
        (actor.side === 'home' ? this.formations.home : this.formations.away) as never,
        actor.side,
      );
      const index = (this.sideCache.get(actor.side) ?? []).indexOf(actor);
      const homeIndex = Math.max(0, index % 11);
      const point = formation[homeIndex] ?? formation[0]!;
      const base = new THREE.Vector3(point.x, 0, point.z);
      const direction = actor.side === 'home' ? 1 : -1;
      const ballOffset = new THREE.Vector3(
        ball.x - base.x,
        0,
        ball.z - base.z,
      );

      if (teamHasBall) {
        if (actor === this.teamNearest(actor.side, ball)) {
          actor.target.copy(ball).add(
            new THREE.Vector3(-direction * 0.8, 0, 0),
          );
          if (
            ballOffset.length() < 1.65
            && this.physics.getBallSpeed() < 12
          ) {
            this.tryAIKick(actor, ball, direction);
          }
        } else {
          const push = actor.profile.position === 'ST'
            || actor.profile.position === 'LW'
            || actor.profile.position === 'RW'
            ? 12
            : 5;
          actor.target.copy(base).add(
            new THREE.Vector3(direction * push, 0, ball.z * 0.08),
          );
          if (actor.profile.position === 'LW') actor.target.z -= 7;
          if (actor.profile.position === 'RW') actor.target.z += 7;
        }
      } else {
        const pressing = this.tactics[actor.side] === 'press'
          ? 1
          : this.tactics[actor.side] === 'defensive'
            ? 0.58
            : 0.78;

        if (isPressing) {
          actor.target.copy(ball).add(
            new THREE.Vector3(-direction * 0.45, 0, 0),
          );
        } else {
          actor.target.copy(base).lerp(
            ball,
            Math.min(0.45, pressing * 0.28),
          );
          const lane = actor.profile.position === 'LB'
            || actor.profile.position === 'LW'
            ? -1
            : actor.profile.position === 'RB'
              || actor.profile.position === 'RW'
              ? 1
              : 0;
          actor.target.z += lane * Math.min(5, Math.abs(ball.z) * 0.14);
        }
      }

      if (actor.profile.position === 'GK') {
        this.positionKeeper(actor, ball, direction, ballVelocity);
      }
    }
  }

  private moveActor(
    actor: PlayerActor,
    dt: number,
    ball: THREE.Vector3,
    controlled: PlayerActor,
  ): void {
    const toTarget = this.scratch.copy(actor.target).sub(actor.group.position);
    toTarget.y = 0;
    const distance = toTarget.length();

    if (distance < 0.08) {
      actor.velocity.multiplyScalar(Math.exp(-8 * dt));
      return;
    }

    const style = this.tactics[actor.side];
    let topSpeed = actor.profile.attributes.speed / 19;

    if (
      style === 'counter'
      && (actor.profile.position === 'ST'
        || actor.profile.position === 'LW'
        || actor.profile.position === 'RW')
    ) {
      topSpeed *= 1.08;
    }
    if (style === 'press' && distance < 15) topSpeed *= 1.12;

    const accel = actor.profile.attributes.acceleration / 25;
    const targetVelocity = toTarget
      .normalize()
      .multiplyScalar(Math.min(topSpeed, distance * 1.6));
    actor.velocity.lerp(
      targetVelocity,
      1 - Math.exp(-accel * dt),
    );
    actor.group.position.addScaledVector(actor.velocity, dt);
    actor.group.position.x = THREE.MathUtils.clamp(
      actor.group.position.x,
      -51,
      51,
    );
    actor.group.position.z = THREE.MathUtils.clamp(
      actor.group.position.z,
      -33,
      33,
    );

    if (actor.velocity.lengthSq() > 0.04) {
      actor.yaw = Math.atan2(actor.velocity.z, actor.velocity.x);
    }

    actor.group.rotation.y = -actor.yaw + Math.PI / 2;
    actor.locomotion = actor.velocity.length() > 4.6
      ? 'sprint'
      : actor.velocity.length() > 1
        ? 'run'
        : 'idle';
    actor.updateAnimation(dt, actor.velocity.length());

    if (
      actor.side !== controlled.side
      && distance < 1.65
      && this.physics.getBallSpeed() < 3.2
      && Math.random() < dt * 1.4
    ) {
      const ballDelta = ball.clone().sub(actor.group.position);
      if (ballDelta.length() < 1.7) {
        this.physics.kick(
          new THREE.Vector3(actor.side === 'home' ? 1 : -1, 0.03, 0),
          1.3 + actor.profile.attributes.tackling / 45,
          0.015,
        );
      }
    }
  }

  private positionKeeper(
    actor: PlayerActor,
    ball: THREE.Vector3,
    direction: number,
    ballVelocity: THREE.Vector3,
  ): void {
    const goalX = -direction * 49.4;
    const goalZ = THREE.MathUtils.clamp(ball.z * 0.32, -3.1, 3.1);
    const predict = ballVelocity.x * 0.35;
    actor.target.set(
      goalX + THREE.MathUtils.clamp(predict, -1.8, 1.8),
      0,
      goalZ,
    );
  }

  private tryAIKick(
    actor: PlayerActor,
    ball: THREE.Vector3,
    direction: number,
  ): void {
    const attacking = (this.sideCache.get(actor.side) ?? []).filter(
      (player) => player !== actor && player.profile.position !== 'GK',
    );
    const forward = attacking.sort((a, b) => {
      const scoreA = (a.group.position.x - ball.x) * direction
        - Math.abs(a.group.position.z - ball.z) * 0.35;
      const scoreB = (b.group.position.x - ball.x) * direction
        - Math.abs(b.group.position.z - ball.z) * 0.35;
      return scoreB - scoreA;
    });

    const goalDistance = Math.hypot(52.5 - Math.abs(ball.x), ball.z);
    const shouldShoot = goalDistance < 23 && Math.random() < 0.38;
    let shotDirection: THREE.Vector3;

    if (shouldShoot) {
      this.onShot?.(actor.side);
      shotDirection = new THREE.Vector3(
        direction,
        0.06 + Math.random() * 0.08,
        (Math.random() - 0.5) * 0.3,
      );
      this.physics.kick(
        shotDirection,
        15 + actor.profile.attributes.shotPower * 0.13,
        0.8,
      );
    } else if (forward[0]) {
      const target = forward[0].group.position;
      shotDirection = new THREE.Vector3(
        target.x - ball.x,
        0.02,
        target.z - ball.z,
      );
      this.physics.kick(
        shotDirection,
        5.7 + actor.profile.attributes.passing * 0.035,
        0.08,
      );
    } else {
      this.physics.kick(
        new THREE.Vector3(direction, 0.08, 0),
        8,
        0.1,
      );
    }
  }

  private closestToBall(side: TeamSide, ball: THREE.Vector3): PlayerActor {
    const team = this.sideCache.get(side)!;
    let best = team[0]!;
    let bestDistance = Infinity;

    for (const actor of team) {
      const distance = actor.group.position.distanceToSquared(ball);
      if (distance < bestDistance) {
        best = actor;
        bestDistance = distance;
      }
    }

    return best;
  }

  private teamNearest(side: TeamSide, ball: THREE.Vector3): PlayerActor | null {
    return this.closestToBall(side, ball);
  }
}
