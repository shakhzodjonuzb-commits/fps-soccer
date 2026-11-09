import * as THREE from 'three';
import { PlayerActor } from './entities/PlayerActor';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { FootballAI } from './ai/FootballAI';
import { buildStadium, FIELD } from './stadium/field';
import { getFormation } from './match/formation';
import { StadiumAudio } from './audio/StadiumAudio';
import { createPlayer } from '../data/players';
import type { Difficulty, FormationId, MatchHud, PlayerProfile, TeamSide } from '../shared/types';
import type { ClubState, GameSettings } from '../shared/types';

export type GameAction = 'pass' | 'through' | 'shoot' | 'long' | 'skill' | 'tackle';
export interface GameCallbacks {
  onHud: (hud: MatchHud) => void;
  onEvent: (message: string, kind?: 'goal' | 'info' | 'warning') => void;
  onFinish: (home: number, away: number, stats: MatchStats) => void;
  onHalfTime: () => void;
}
export interface MatchStats { shotsHome: number; shotsAway: number; possessionHome: number; possessionAway: number; }

export class FootballGame {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.08, 280);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly ballMesh: THREE.Mesh;
  private readonly ballShadow: THREE.Mesh;
  private readonly actors: PlayerActor[] = [];
  private physics!: PhysicsWorld;
  private ai!: FootballAI;
  private user!: PlayerActor;
  private readonly clock = new THREE.Clock();
  private readonly ballVelocity = new THREE.Vector3();
  private readonly temp = new THREE.Vector3();
  private readonly audio = new StadiumAudio();
  private readonly callbacks: GameCallbacks;
  private readonly canvas: HTMLCanvasElement;
  private readonly settings: GameSettings;
  private raf = 0;
  private elapsed = 0;
  private duration: number;
  private scoreHome = 0;
  private scoreAway = 0;
  private half: 1 | 2 = 1;
  private halftimePause = 0;
  private goalPause = 0;
  private finished = false;
  private paused = false;
  private moveX = 0;
  private moveY = 0;
  private sprinting = false;
  private lookYaw = 0;
  private lookPitch = 0;
  private aimPower = 0.62;
  private possessionHomeSeconds = 0;
  private shotsHome = 0;
  private shotsAway = 0;
  private autoSwitchTimer = 0;
  private readonly teamFormations: Record<TeamSide, FormationId> = { home: '4-3-3', away: '4-3-3' };
  private event = 'O‘yin boshlandi';
  private lastHud = 0;
  private matchStartCountdown = 2.5;
  private readonly dprLimit: number;
  private pointerLook = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private isSkillCooldown = 0;

  private constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks, club: ClubState, settings: GameSettings) {
    this.canvas = canvas; this.callbacks = callbacks; this.settings = settings;
    this.duration = settings.matchLength * 60;
    this.dprLimit = settings.graphics === 'high' ? 1.75 : settings.graphics === 'medium' ? 1.35 : 1.05;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.graphics === 'high', alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprLimit));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = settings.graphics !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera.position.set(-1, 1.6, 0); this.camera.rotation.order = 'YXZ';
    buildStadium(this.scene, settings.graphics);

    const ballMaterial = new THREE.MeshStandardMaterial({ color: '#f3f5f2', roughness: 0.42, metalness: 0.02 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), ballMaterial);
    this.ballMesh.castShadow = true; this.ballMesh.receiveShadow = true; this.scene.add(this.ballMesh);
    const ballPattern = new THREE.Mesh(new THREE.IcosahedronGeometry(0.222, 1), new THREE.MeshBasicMaterial({ color: '#172a38', wireframe: true, transparent: true, opacity: 0.2 }));
    this.ballMesh.add(ballPattern);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshBasicMaterial({ color: '#00180b', transparent: true, opacity: 0.22, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.ballShadow.position.y = 0.018; this.scene.add(this.ballShadow);
    this.createTeams(club);
    this.camera.position.set(this.user.group.position.x, 1.58, this.user.group.position.z);
    this.camera.rotation.y = -Math.PI / 2;
    this.audio.start(settings.sound, settings.crowdVolume, settings.effectsVolume);
    this.bindLookEvents();
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, callbacks: GameCallbacks, club: ClubState, settings: GameSettings, difficulty: Difficulty = 'normal'): Promise<FootballGame> {
    const game = new FootballGame(canvas, callbacks, club, settings);
    game.physics = await PhysicsWorld.create();
    game.ai = new FootballAI(game.actors, game.physics, { home: club.formation, away: '4-3-3' }, { home: club.tactics, away: 'balanced' }, difficulty, (side) => { if (side === 'home') game.shotsHome++; else game.shotsAway++; });
    for (const actor of game.actors) game.physics.addPlayer(actor);
    game.kickoff();
    game.startLoop();
    return game;
  }

  private createTeams(club: ClubState): void {
    const homeProfiles = club.squad.slice(0, 11);
    const awayProfiles = Array.from({ length: 11 }, (_, i) => createPlayer(500 + i, { overall: 65 + (i % 6) * 2, position: homeProfiles[i]?.position ?? 'CM', name: ['Marco Silva','Ibrahim Duran','Luka Markovic','Alex Novak','Rui Santos','Yusuf Demir','Ethan Cole','Niko Varga','Sami Benali','Leo Fischer','Diego Costa'][i]! }));
    this.teamFormations.home = club.formation;
    this.teamFormations.away = '4-3-3';
    this.addTeam('home', homeProfiles, club.identity.primary, club.identity.secondary, club.formation);
    this.addTeam('away', awayProfiles, '#d64a51', '#f4e8e8', '4-3-3');
    this.user = this.actors.find((p) => p.side === 'home' && p.profile.position === 'CM') ?? this.actors[6]!;
    this.user.setFirstPerson(true);
    this.user.setControlledMarker(true);
  }

  private addTeam(side: TeamSide, profiles: PlayerProfile[], primary: string, secondary: string, formation: FormationId): void {
    const points = getFormation(formation, side);
    const ordered = [...profiles].sort((a, b) => {
      const priority = (position: string) => ({ GK: 0, CB: 1, LB: 2, RB: 3, DM: 4, CM: 5, AM: 6, LW: 7, RW: 8, ST: 9 } as Record<string, number>)[position] ?? 10;
      return priority(a.position) - priority(b.position);
    });
    for (let i = 0; i < 11; i++) {
      const profile = ordered[i] ?? createPlayer(900 + i);
      const actor = new PlayerActor(profile, side, primary, secondary, false);
      const point = points[i]!;
      actor.group.position.set(point.x, 0, point.z);
      actor.target.set(point.x, 0, point.z);
      actor.yaw = side === 'home' ? 0 : Math.PI;
      actor.group.rotation.y = side === 'home' ? Math.PI / 2 : -Math.PI / 2;
      actor.group.scale.setScalar(1);
      this.scene.add(actor.group); this.actors.push(actor);
    }
  }

  startLoop(): void {
    const frame = () => {
      this.raf = requestAnimationFrame(frame);
      this.update(Math.min(this.clock.getDelta(), 0.05));
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private update(dt: number): void {
    if (this.finished) return;
    this.isSkillCooldown = Math.max(0, this.isSkillCooldown - dt);
    if (this.matchStartCountdown > 0) {
      this.matchStartCountdown -= dt;
      if (this.matchStartCountdown <= 0) this.callbacks.onEvent('Hakam hushtagi! O‘yin boshlandi', 'info');
    }
    if (this.paused) { this.updateCamera(dt); return; }
    if (this.goalPause > 0) {
      this.goalPause -= dt;
      this.updateCamera(dt);
      if (this.goalPause <= 0) this.kickoff();
      this.emitHud(); return;
    }
    if (this.halftimePause > 0) {
      this.halftimePause -= dt;
      if (this.halftimePause <= 0) {
        this.half = 2; this.elapsed = this.duration / 2;
        this.callbacks.onEvent('Ikkinchi bo‘lim boshlandi', 'info'); this.kickoff();
      }
      this.emitHud(); this.updateCamera(dt); return;
    }

    const matchTime = this.duration;
    this.elapsed = Math.min(matchTime, this.elapsed + dt);
    if (this.half === 1 && this.elapsed >= matchTime / 2) {
      this.halftimePause = 4.5; this.callbacks.onHalfTime(); this.audio.whistle();
    }
    const ballPosition = this.physics.ballPosition();
    this.updateUser(dt, ballPosition);
    this.ai.update(dt, this.user);
    this.physics.syncPlayers(this.actors);
    this.physics.step(dt);
    this.physics.addBallSpin();
    this.updateBallMesh(dt);
    this.updatePossession(ballPosition, dt);
    this.updateAutoSwitch(dt, ballPosition);
    this.checkGoalAndBounds();
    this.updateCamera(dt);
    this.emitHud();
  }

  private updateUser(dt: number, ball: THREE.Vector3): void {
    const magnitude = Math.hypot(this.moveX, this.moveY);
    const move = new THREE.Vector3(-this.moveY, 0, this.moveX);
    move.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.user.yaw);
    if (magnitude > 0.06) {
      const maxSpeed = this.user.profile.attributes.speed / 19;
      const sprintBoost = this.sprinting && this.user.stamina > 7 ? 1.28 : 1;
      const speed = maxSpeed * sprintBoost * Math.min(1, magnitude);
      this.user.desired.copy(move).normalize().multiplyScalar(speed);
      const acceleration = this.user.profile.attributes.acceleration / 18;
      this.user.velocity.lerp(this.user.desired, 1 - Math.exp(-acceleration * dt));
      this.user.locomotion = this.sprinting ? 'sprint' : 'run';
      if (this.sprinting) this.user.stamina = Math.max(0, this.user.stamina - dt * 4.6);
      else this.user.stamina = Math.min(this.user.profile.attributes.stamina, this.user.stamina + dt * 1.1);
      this.user.yaw = Math.atan2(this.user.velocity.z, this.user.velocity.x);
    } else {
      this.user.velocity.multiplyScalar(Math.exp(-9 * dt));
      this.user.locomotion = this.user.hasBall ? 'dribble' : 'idle';
      this.user.stamina = Math.min(this.user.profile.attributes.stamina, this.user.stamina + dt * 2.2);
    }
    this.user.group.position.addScaledVector(this.user.velocity, dt);
    this.user.group.position.x = THREE.MathUtils.clamp(this.user.group.position.x, -50.8, 50.8);
    this.user.group.position.z = THREE.MathUtils.clamp(this.user.group.position.z, -32.8, 32.8);
    this.user.group.rotation.y = -this.user.yaw + Math.PI / 2;
    this.user.updateAnimation(dt, this.user.velocity.length());

    const distance = this.user.group.position.distanceTo(ball);
    if (distance < 1.15 && this.user.hasBall) {
      const carryDirection = this.user.velocity.lengthSq() > 0.1 ? this.user.velocity.clone().normalize() : new THREE.Vector3(Math.cos(this.user.yaw), 0, Math.sin(this.user.yaw));
      this.physics.kick(carryDirection, 0.015 + this.user.velocity.length() * 0.008, 0);
    }
  }

  private updateAutoSwitch(dt: number, ball: THREE.Vector3): void {
    if (!this.settings.autoSwitch || this.user.hasBall || this.goalPause > 0) return;
    this.autoSwitchTimer -= dt;
    if (this.autoSwitchTimer > 0) return;
    this.autoSwitchTimer = 0.55;
    const candidates = this.actors.filter((actor) => actor.side === this.user.side && actor.profile.position !== 'GK');
    const nearest = candidates.reduce((best, actor) => actor.group.position.distanceToSquared(ball) < best.group.position.distanceToSquared(ball) ? actor : best, candidates[0] ?? this.user);
    if (nearest !== this.user && nearest.group.position.distanceTo(ball) + 2.2 < this.user.group.position.distanceTo(ball)) this.switchTo(nearest);
  }

  private updatePossession(ball: THREE.Vector3, dt: number): void {
    let nearest: PlayerActor | null = null; let min = 1.25 * 1.25;
    for (const actor of this.actors) {
      const d = actor.group.position.distanceToSquared(ball);
      if (d < min) { min = d; nearest = actor; }
      actor.hasBall = false;
    }
    if (nearest && this.physics.getBallSpeed() < 1.4) nearest.hasBall = true;
    if (this.user.hasBall) this.possessionHomeSeconds += dt;
    else if (nearest?.side === 'home') this.possessionHomeSeconds += dt * 0.75;
  }

  private updateBallMesh(dt: number): void {
    this.physics.interpolateBall(this.temp);
    this.ballMesh.position.copy(this.temp);
    const velocity = this.physics.velocity(this.ballVelocity);
    this.ballMesh.rotation.x += velocity.z * dt * 1.8;
    this.ballMesh.rotation.z -= velocity.x * dt * 1.8;
    this.ballShadow.position.x = this.temp.x; this.ballShadow.position.z = this.temp.z;
    const shadowScale = THREE.MathUtils.clamp(1.25 - Math.max(0, this.temp.y - 0.22) * 0.12, 0.55, 1.25);
    this.ballShadow.scale.setScalar(shadowScale);
  }

  private checkGoalAndBounds(): void {
    const goal = this.physics.isGoal();
    if (goal) {
      if (goal === 'home') this.scoreHome++; else this.scoreAway++;
      if (this.user.side === goal) this.user.profile.goals++;
      const message = goal === 'home' ? 'GOL! Jamoangiz hisobni ochdi!' : 'Raqib gol urdi';
      this.event = message; this.callbacks.onEvent(message, 'goal'); this.audio.goal(); this.goalPause = 2.2;
      this.actors.forEach((a) => { if (a.side === goal) a.locomotion = 'celebrate'; });
      return;
    }
    if (this.physics.isOutOfBounds()) {
      this.event = 'To‘p maydon tashqarisida'; this.callbacks.onEvent('To‘p maydon tashqarisida — o‘yin davom etadi', 'info');
      this.physics.resetBall(0, 0);
    }
  }

  private kickoff(): void {
    this.physics.resetBall(0, 0);
    for (const actor of this.actors) {
      const formation = getFormation(this.teamFormations[actor.side], actor.side);
      const playerIndex = this.actors.filter((p) => p.side === actor.side).indexOf(actor);
      const point = formation[playerIndex]!;
      actor.group.position.set(point.x, 0, point.z);
      actor.velocity.set(0, 0, 0); actor.hasBall = false;
      actor.locomotion = 'idle';
    }
    this.user.group.position.set(-11, 0, 0);
    this.user.yaw = 0;
    this.matchStartCountdown = 0;
  }

  private updateCamera(dt: number): void {
    const moving = this.user.velocity.length();
    const bob = moving > 0.5 ? Math.sin(performance.now() * (this.sprinting ? 0.016 : 0.012)) * (this.sprinting ? 0.045 : 0.022) : 0;
    const target = new THREE.Vector3(this.user.group.position.x, 1.57 + bob, this.user.group.position.z);
    this.camera.position.lerp(target, 1 - Math.exp(-12 * dt));
    const yaw = -this.user.yaw - Math.PI / 2 + this.lookYaw;
    this.camera.rotation.y = THREE.MathUtils.damp(this.camera.rotation.y, yaw, 13, dt);
    this.camera.rotation.x = THREE.MathUtils.damp(this.camera.rotation.x, this.lookPitch, 10, dt);
  }

  setMovement(x: number, y: number): void { this.moveX = THREE.MathUtils.clamp(x, -1, 1); this.moveY = THREE.MathUtils.clamp(y, -1, 1); void this.audio.resume(); }
  setSprint(value: boolean): void { this.sprinting = value; }
  setAimPower(value: number): void { this.aimPower = THREE.MathUtils.clamp(value, 0.15, 1); }
  setSoundEnabled(value: boolean): void { this.audio.setEnabled(value); }
  togglePause(): void { this.paused = !this.paused; if (!this.paused) void this.audio.resume(); }
  getPaused(): boolean { return this.paused; }
  finishNow(): void {
    if (this.finished) return;
    this.finished = true; this.paused = true; this.audio.whistle();
    this.callbacks.onFinish(this.scoreHome, this.scoreAway, {
      shotsHome: this.shotsHome, shotsAway: this.shotsAway,
      possessionHome: Math.round(this.possessionHomeSeconds / Math.max(1, this.elapsed) * 100),
      possessionAway: 100 - Math.round(this.possessionHomeSeconds / Math.max(1, this.elapsed) * 100),
    });
  }

  switchPlayer(mode: 'nearest' | 'cycle' | 'defend' = 'nearest'): void {
    const team = this.actors.filter((a) => a.side === this.user.side);
    if (team.length < 2) return;
    const ball = this.physics.ballPosition();
    let target: PlayerActor;
    if (mode === 'cycle') {
      const index = team.findIndex((a) => a === this.user);
      target = team[(index + 1) % team.length]!;
    } else {
      const candidates = team.filter((a) => a !== this.user && (mode !== 'defend' || (a.profile.position !== 'GK' && a.profile.position !== 'ST')));
      target = candidates.reduce((best, actor) => {
        const d = actor.group.position.distanceToSquared(ball);
        return d < best.group.position.distanceToSquared(ball) ? actor : best;
      }, candidates[0] ?? team.find((a) => a !== this.user)!);
    }
    this.switchTo(target);
  }

  private switchTo(target: PlayerActor): void {
    if (target === this.user) return;
    this.user.setControlledMarker(false); this.user.setFirstPerson(false);
    this.user = target; this.user.setFirstPerson(true); this.user.setControlledMarker(true);
    this.lookYaw = 0; this.lookPitch = 0; this.autoSwitchTimer = 0.8;
    this.audio.button(); this.callbacks.onEvent(`${target.profile.name} boshqaruvga olindi`, 'info');
  }

  action(action: GameAction): void {
    void this.audio.resume();
    if (this.finished || this.paused || this.goalPause > 0) return;
    const ball = this.physics.ballPosition();
    const distance = this.user.group.position.distanceTo(ball);
    const opponent = this.closestOpponent(ball);
    if (action === 'tackle') {
      if (opponent && this.user.group.position.distanceTo(opponent.group.position) < 2.1) {
        opponent.velocity.add(new THREE.Vector3(Math.cos(this.user.yaw), 0, Math.sin(this.user.yaw)).multiplyScalar(2.8));
        if (this.physics.getBallSpeed() < 4) this.physics.kick(new THREE.Vector3(Math.cos(this.user.yaw), 0.04, Math.sin(this.user.yaw)), 2.8, 0.12);
        this.user.stamina = Math.max(0, this.user.stamina - 5);
        this.callbacks.onEvent('To‘p uchun kurash!', 'info');
      }
      return;
    }
    if (action === 'skill') {
      if (this.isSkillCooldown > 0) return;
      this.isSkillCooldown = 1.1;
      const side = new THREE.Vector3(-Math.sin(this.user.yaw), 0, Math.cos(this.user.yaw));
      this.user.group.position.addScaledVector(side, this.moveX >= 0 ? 0.9 : -0.9);
      this.user.stamina = Math.max(0, this.user.stamina - 2.5);
      this.callbacks.onEvent('Texnik harakat!', 'info');
      return;
    }
    if (distance > 2.1) { this.callbacks.onEvent('To‘p yetarlicha yaqin emas', 'warning'); return; }
    const forward = new THREE.Vector3(Math.cos(this.user.yaw + this.lookYaw), 0, Math.sin(this.user.yaw + this.lookYaw));
    let direction = forward.clone(); let power = 0; let lift = 0;
    switch (action) {
      case 'pass': {
        const target = this.pickPassTarget(ball, false);
        if (target) direction = target.group.position.clone().sub(ball).setY(0).normalize();
        power = 5.8 + this.user.profile.attributes.passing * 0.045 * this.aimPower; lift = 0.08; break;
      }
      case 'through': {
        const target = this.pickPassTarget(ball, true);
        if (target) direction = target.group.position.clone().add(new THREE.Vector3(Math.cos(this.user.yaw), 0, Math.sin(this.user.yaw)).multiplyScalar(4)).sub(ball).setY(0).normalize();
        power = 8.2 + this.user.profile.attributes.passing * 0.055 * this.aimPower; lift = 0.16; break;
      }
      case 'long': {
        const target = this.pickPassTarget(ball, true);
        if (target) direction = target.group.position.clone().sub(ball).normalize();
        power = 13 + this.user.profile.attributes.shotPower * 0.08 * this.aimPower; lift = 1.7; break;
      }
      case 'shoot': {
        const goalX = 52.5;
        direction = new THREE.Vector3(goalX - ball.x, 0.12 + this.aimPower * 0.22, -ball.z * 0.04 + (Math.random() - 0.5) * 0.08).normalize();
        power = 14 + this.user.profile.attributes.shotPower * 0.12 * this.aimPower; lift = this.aimPower * 1.1;
        if (this.user.side === 'home') this.shotsHome++; else this.shotsAway++;
        break;
      }
    }
    this.physics.kick(direction, power, lift);
    this.user.hasBall = false; this.user.stamina = Math.max(0, this.user.stamina - 1.3);
    this.audio.kick(Math.min(1, power / 22)); this.event = action === 'shoot' ? 'ZARBA!' : 'Pas berildi';
  }

  private pickPassTarget(ball: THREE.Vector3, forwardOnly: boolean): PlayerActor | null {
    const direction = this.user.side === 'home' ? 1 : -1;
    const teammates = this.actors.filter((a) => a.side === this.user.side && a !== this.user && a.profile.position !== 'GK');
    return teammates
      .filter((a) => !forwardOnly || (a.group.position.x - ball.x) * direction > -3)
      .sort((a, b) => {
        const score = (actor: PlayerActor) => actor.group.position.distanceTo(ball) + Math.max(0, -(actor.group.position.x - ball.x) * direction) * 0.5;
        return score(a) - score(b);
      })[0] ?? null;
  }

  private closestOpponent(ball: THREE.Vector3): PlayerActor | null {
    const opponents = this.actors.filter((a) => a.side !== this.user.side);
    return opponents.reduce<PlayerActor | null>((best, actor) => !best || actor.group.position.distanceToSquared(ball) < best.group.position.distanceToSquared(ball) ? actor : best, null);
  }

  private emitHud(): void {
    const now = performance.now(); if (now - this.lastHud < 110) return; this.lastHud = now;
    const minute = Math.min(90, Math.floor(this.elapsed / this.duration * 90));
    this.callbacks.onHud({
      home: this.scoreHome, away: this.scoreAway, clock: `${String(minute).padStart(2, '0')}:${String(Math.floor((this.elapsed / this.duration * 90 % 1) * 60)).padStart(2, '0')}`,
      half: this.half === 1 ? '1-BO‘LIM' : '2-BO‘LIM', player: this.user.profile.name,
      stamina: Math.round(this.user.stamina / this.user.profile.attributes.stamina * 100),
      possession: `${Math.round(this.possessionHomeSeconds / Math.max(1, this.elapsed) * 100)}%`, event: this.event,
    });
    if (this.elapsed >= this.duration && !this.finished) {
      this.finished = true; this.audio.whistle();
      this.callbacks.onFinish(this.scoreHome, this.scoreAway, {
        shotsHome: this.shotsHome, shotsAway: this.shotsAway,
        possessionHome: Math.round(this.possessionHomeSeconds / Math.max(1, this.elapsed) * 100),
        possessionAway: 100 - Math.round(this.possessionHomeSeconds / Math.max(1, this.elapsed) * 100),
      });
    }
  }

  private resize = (): void => {
    const width = window.innerWidth; const height = window.innerHeight;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprLimit));
  };

  private bindLookEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('resize', this.resize);
  }
  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' || event.clientX > window.innerWidth * 0.52) {
      this.pointerLook = true; this.lastPointerX = event.clientX; this.lastPointerY = event.clientY;
    }
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (!this.pointerLook) return;
    const sensitivity = this.settings.sensitivity * 0.0042;
    this.lookYaw -= (event.clientX - this.lastPointerX) * sensitivity;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + (event.clientY - this.lastPointerY) * sensitivity, -0.48, 0.42);
    this.lastPointerX = event.clientX; this.lastPointerY = event.clientY;
  };
  private onPointerUp = (): void => { this.pointerLook = false; };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove); window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('resize', this.resize);
    this.audio.dispose();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    this.physics?.dispose(); this.renderer.dispose();
  }
}
