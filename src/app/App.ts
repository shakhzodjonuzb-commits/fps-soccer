import { FootballGame, type GameAction, type MatchStats } from '../game/FootballGame';
import { App as NativeApp } from '@capacitor/app';
import { createNewCareer, buyPlayer, sellPlayer, trainPlayer, changeTactics, finishCareerMatch, formatMoney } from '../management/club';
import { loadSlot, saveSlot, deleteSlot } from '../persistence/save-store';
import type { FormationId, GameSettings, SaveSlot, TacticalStyle } from '../shared/types';

const $ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T | null => root.querySelector(selector) as T | null;
const money = (value: number) => `${formatMoney(value)} so‘m`;

export class App {
  private readonly root: HTMLElement;
  private slot: SaveSlot = createNewCareer();
  private game: FootballGame | null = null;
  private view = 'home';
  private saveTimer = 0;
  private joystickPointer: number | null = null;
  private sprintPointer: number | null = null;
  private joystickCenter = { x: 0, y: 0 };
  private readonly slotId = 'career-main';
  private marketFilter = 'all';
  private marketSort: 'overall' | 'price' = 'overall';
  private marketSearch = '';

  constructor(root: HTMLElement) { this.root = root; }

  async init(): Promise<void> {
    try {
      const saved = await loadSlot(this.slotId);
      if (saved) this.slot = saved;
    } catch (error) {
      console.warn('Save recovery:', error);
      this.showToast('Saqlangan karera buzilgan. Yangi karera yaratildi.');
    }
    this.applySettings();
    this.bindEvents();
    void NativeApp.addListener('appStateChange', ({ isActive }) => { if (!isActive) void this.persist(); });
    void NativeApp.addListener('backButton', () => {
      if (this.game) { if (!this.game.getPaused()) { this.game.togglePause(); this.togglePauseOverlay(); } else this.game.finishNow(); }
      else this.navigate('home');
    });
    this.renderHome();
    document.addEventListener('visibilitychange', this.handleVisibility);
    window.addEventListener('beforeunload', this.saveNow);
    this.saveTimer = window.setInterval(() => { void this.persist(); }, 20000);
  }

  private bindEvents(): void {
    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action], [data-view], [data-game-action], [data-market-filter]');
      if (!target || target.hasAttribute('disabled')) return;
      const gameAction = target.dataset.gameAction;
      if (gameAction) { this.handleGameAction(gameAction); return; }
      const view = target.dataset.view;
      if (view) { this.navigate(view); return; }
      const marketFilter = target.dataset.marketFilter;
      if (marketFilter) { this.marketFilter = marketFilter; this.renderTransfers(this.marketSearch); return; }
      const action = target.dataset.action;
      if (action) void this.handleAction(action, target);
    });
    this.root.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.matches('[data-setting]')) this.updateSetting(target);
      if (target.matches('[data-aim-power]')) this.game?.setAimPower(Number(target.value) / 100);
      if (target.matches('[data-market-search]')) this.filterMarket(target.value);
    });
    this.root.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (target.matches('[data-setting]')) this.updateSetting(target);
      if (target.matches('[data-market-sort]')) { this.marketSort = (target as HTMLSelectElement).value as 'overall' | 'price'; this.renderTransfers(this.marketSearch); }
    });
    this.root.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('popstate', () => this.navigate('home', false));
  }

  private navigate(view: string, push = true): void {
    if (view !== 'match' && this.game) this.stopMatch();
    this.view = view;
    if (push) history.pushState({ view }, '', `#${view}`);
    switch (view) {
      case 'home': this.renderHome(); break;
      case 'play': this.renderPlay(); break;
      case 'club': this.renderClub(); break;
      case 'squad': this.renderSquad(); break;
      case 'transfers': this.renderTransfers(); break;
      case 'training': this.renderTraining(); break;
      case 'tactics': this.renderTactics(); break;
      case 'career': this.renderCareer(); break;
      case 'settings': this.renderSettings(); break;
      default: this.renderHome();
    }
  }

  private async handleAction(action: string, target: HTMLElement): Promise<void> {
    switch (action) {
      case 'quick-match': await this.startMatch(); break;
      case 'new-career': {
        const name = window.prompt('Klub nomini kiriting:', this.slot.club.identity.name);
        if (name === null) break;
        this.slot = createNewCareer(name); await this.persist(); this.renderHome(); this.showToast('Yangi karera yaratildi'); break;
      }
      case 'back': this.navigate('home'); break;
      case 'buy-player': this.buyFromMarket(target.dataset.playerId ?? ''); break;
      case 'sell-player': this.sellSquadPlayer(target.dataset.playerId ?? ''); break;
      case 'train-player': this.trainSquadPlayer(target.dataset.playerId ?? '', (target.dataset.focus as 'technical' | 'physical' | 'defense') ?? 'technical'); break;
      case 'formation': this.setFormation(target.dataset.formation as FormationId); break;
      case 'tactic': this.setTactic(target.dataset.tactic as TacticalStyle); break;
      case 'select-manager': this.hireManager(target.dataset.manager ?? ''); break;
      case 'set-captain': this.setCaptain(target.dataset.playerId ?? ''); break;
      case 'pause': this.game?.togglePause(); this.togglePauseOverlay(); break;
      case 'resume': this.game?.togglePause(); $('#pause-overlay', this.root)?.classList.add('hidden'); break;
      case 'end-match': this.game?.finishNow(); break;
      case 'save': await this.persist(); this.showToast('Karera saqlandi'); break;
      case 'delete-career': {
        if (!confirm('Joriy karera butunlay o‘chirilsinmi?')) break;
        await deleteSlot(this.slotId); this.slot = createNewCareer(); await this.persist(); this.navigate('home'); break;
      }
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'sound-toggle': this.slot.settings.sound = !this.slot.settings.sound; this.game?.setSoundEnabled(this.slot.settings.sound); await this.persist(); this.renderSettings(); break;
    }
  }

  private handleGameAction(action: string): void {
    if (!this.game) return;
    if (action === 'switch') { this.game.switchPlayer('nearest'); return; }
    if (action === 'switch-cycle') { this.game.switchPlayer('cycle'); return; }
    if (['pass', 'through', 'shoot', 'long', 'skill', 'tackle'].includes(action)) this.game.action(action as GameAction);
  }

  private async startMatch(): Promise<void> {
    this.view = 'match';
    this.root.innerHTML = this.matchTemplate();
    const canvas = $('#match-canvas', this.root) as HTMLCanvasElement | null;
    if (!canvas) return;
    this.showToast('Stadion yuklanmoqda…');
    try {
      this.game = await FootballGame.create(canvas, {
        onHud: (hud) => this.updateHud(hud),
        onEvent: (message, kind) => this.showMatchEvent(message, kind ?? 'info'),
        onHalfTime: () => this.showHalfTime(),
        onFinish: (home, away, stats) => {
          this.slot = finishCareerMatch(this.slot, home, away);
          void this.persist();
          this.showMatchResult(stats);
        },
      }, this.slot.club, this.slot.settings, 'normal');
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
      this.applySettings();
    } catch (error) {
      console.error(error);
      this.root.innerHTML = `<div class="fatal-screen"><h2>3D dvigatel ishga tushmadi</h2><p>${this.escape(String(error))}</p><button data-action="back" class="primary-btn">Asosiy menyu</button></div>`;
    }
  }

  private stopMatch(): void {
    this.game?.destroy(); this.game = null;
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    this.applySettings();
  }

  private updateHud(hud: { home: number; away: number; clock: string; half: string; player: string; stamina: number; possession: string; event: string }): void {
    const home = $('#score-home', this.root); const away = $('#score-away', this.root);
    const clock = $('#match-clock', this.root); const name = $('#controlled-name', this.root);
    const stamina = $('#stamina-fill', this.root); const event = $('#match-event-text', this.root);
    const half = $('#match-half', this.root); const possession = $('#possession-value', this.root);
    if (home) home.textContent = String(hud.home); if (away) away.textContent = String(hud.away);
    if (clock) clock.textContent = hud.clock; if (name) name.textContent = hud.player;
    if (stamina) (stamina as HTMLElement).style.width = `${hud.stamina}%`;
    if (event) event.textContent = hud.event; if (half) half.textContent = hud.half;
    if (possession) possession.textContent = hud.possession;
  }

  private showMatchEvent(message: string, kind: 'goal' | 'info' | 'warning'): void {
    const node = $('#match-event', this.root); const text = $('#match-event-text', this.root);
    if (!node || !text) return;
    text.textContent = message; node.className = `match-event ${kind}`;
    node.classList.remove('hidden');
    window.setTimeout(() => node.classList.add('hidden'), kind === 'goal' ? 2600 : 1700);
  }

  private showHalfTime(): void {
    const overlay = $('#halftime-overlay', this.root);
    overlay?.classList.remove('hidden');
    window.setTimeout(() => overlay?.classList.add('hidden'), 4300);
  }

  private showMatchResult(stats: MatchStats | null): void {
    if (!this.game) return;
    this.game.togglePause();
    const home = $('#score-home', this.root)?.textContent ?? '0';
    const away = $('#score-away', this.root)?.textContent ?? '0';
    const overlay = $('#result-overlay', this.root);
    if (!overlay) return;
    overlay.innerHTML = `<div class="result-card"><div class="eyebrow">TO‘LIQ VAQT</div><h2>Uchrashuv yakunlandi</h2><div class="result-score"><span>${home}</span><i>:</i><span>${away}</span></div><p>${this.slot.club.identity.name} · ${stats?.possessionHome ?? 50}% to‘p nazorati</p><div class="result-stats"><div><b>${stats?.shotsHome ?? 0}</b><small>Uy zarbalari</small></div><div><b>${stats?.possessionHome ?? 50}%</b><small>To‘p nazorati</small></div><div><b>${stats?.shotsAway ?? 0}</b><small>Raqib zarbalari</small></div></div><button data-action="back" class="primary-btn full">Klubga qaytish</button></div>`;
    overlay.classList.remove('hidden');
  }

  private togglePauseOverlay(): void { $('#pause-overlay', this.root)?.classList.toggle('hidden'); }

  private onPointerDown = (event: PointerEvent): void => {
    const zone = (event.target as HTMLElement).closest<HTMLElement>('[data-joystick]');
    if (zone && this.game) {
      event.preventDefault(); this.joystickPointer = event.pointerId;
      const rect = zone.getBoundingClientRect();
      this.joystickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      zone.setPointerCapture?.(event.pointerId);
      this.updateJoystick(event.clientX, event.clientY);
    }
    const sprint = (event.target as HTMLElement).closest<HTMLElement>('[data-sprint]');
    if (sprint) { event.preventDefault(); this.game?.setSprint(true); }
  };
  private onPointerMove = (event: PointerEvent): void => {
    if (this.joystickPointer === event.pointerId) { event.preventDefault(); this.updateJoystick(event.clientX, event.clientY); }
  };
  private onPointerUp = (event: PointerEvent): void => {
    if (this.joystickPointer === event.pointerId) { this.joystickPointer = null; this.game?.setMovement(0, 0); }
    if (this.sprintPointer === event.pointerId) { this.sprintPointer = null; this.game?.setSprint(false); }
  };
  private updateJoystick(x: number, y: number): void {
    const dx = x - this.joystickCenter.x; const dy = y - this.joystickCenter.y;
    const radius = 48; const length = Math.hypot(dx, dy); const scale = length > radius ? radius / length : 1;
    const stick = $('#joystick-knob', this.root);
    if (stick) stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    this.game?.setMovement(dx * scale / radius, dy * scale / radius);
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.game) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(event.key)) event.preventDefault();
    if (event.repeat) return;
    switch (event.key.toLowerCase()) {
      case 'w': case 'arrowup': this.game.setMovement(0, -1); break;
      case 's': case 'arrowdown': this.game.setMovement(0, 1); break;
      case 'a': case 'arrowleft': this.game.setMovement(-1, 0); break;
      case 'd': case 'arrowright': this.game.setMovement(1, 0); break;
      case 'shift': this.game.setSprint(true); break;
      case 'e': this.game.switchPlayer('nearest'); break;
      case 'q': this.game.switchPlayer('cycle'); break;
      case 'j': this.game.action('pass'); break;
      case 'k': this.game.action('shoot'); break;
      case 'l': this.game.action('long'); break;
      case ' ': this.game.action('tackle'); break;
    }
  };
  private onKeyUp = (event: KeyboardEvent): void => {
    if (!this.game) return;
    if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(event.key.toLowerCase())) this.game.setMovement(0, 0);
    if (event.key === 'Shift') this.game.setSprint(false);
  };

  private async buyFromMarket(id: string): Promise<void> {
    try { this.slot = buyPlayer(this.slot, id); await this.persist(); this.renderTransfers(); this.showToast('Futbolchi tarkibga qo‘shildi'); }
    catch (error) { this.showToast(error instanceof Error ? error.message : 'Transfer bajarilmadi'); }
  }
  private async sellSquadPlayer(id: string): Promise<void> {
    if (!confirm('Futbolchini sotishga rozimisiz?')) return;
    try { this.slot = sellPlayer(this.slot, id); await this.persist(); this.renderSquad(); this.showToast('Transfer yakunlandi'); }
    catch (error) { this.showToast(error instanceof Error ? error.message : 'Sotuv bajarilmadi'); }
  }
  private async trainSquadPlayer(id: string, focus: 'technical' | 'physical' | 'defense'): Promise<void> {
    try { this.slot = trainPlayer(this.slot, id, focus); await this.persist(); this.renderTraining(); this.showToast('Mashg‘ulot yakunlandi'); }
    catch (error) { this.showToast(error instanceof Error ? error.message : 'Mashg‘ulot bajarilmadi'); }
  }
  private async setFormation(formation: FormationId): Promise<void> { this.slot = changeTactics(this.slot, formation, this.slot.club.tactics); await this.persist(); this.renderTactics(); }
  private async setTactic(tactic: TacticalStyle): Promise<void> { this.slot = changeTactics(this.slot, this.slot.club.formation, tactic); await this.persist(); this.renderTactics(); }
  private async setCaptain(id: string): Promise<void> { this.slot.club.captainId = id; await this.persist(); this.renderSquad(); }
  private async hireManager(name: string): Promise<void> {
    const choices = [
      { name: 'Kamoliddin Rahimov', philosophy: 'balanced' as TacticalStyle, rating: 73, bonus: 3 },
      { name: 'Rafael Mendez', philosophy: 'possession' as TacticalStyle, rating: 82, bonus: 7 },
      { name: 'Tomas Varga', philosophy: 'press' as TacticalStyle, rating: 78, bonus: 5 },
    ];
    const manager = choices.find((c) => c.name === name);
    if (!manager || this.slot.club.balance < 150_000) return this.showToast('Mablag‘ yetarli emas yoki menejer topilmadi');
    this.slot.club.balance -= 150_000;
    this.slot.club.manager = { name: manager.name, philosophy: manager.philosophy, experience: manager.rating - 50, rating: manager.rating, trainingBonus: manager.bonus, developmentBonus: manager.bonus - 1 };
    this.slot.club.tactics = manager.philosophy;
    await this.persist(); this.renderClub(); this.showToast('Yangi menejer tayinlandi');
  }

  private updateSetting(target: HTMLInputElement | HTMLSelectElement): void {
    const key = target.dataset.setting as keyof GameSettings | undefined;
    if (!key) return;
    const value = target instanceof HTMLInputElement && target.type === 'checkbox' ? target.checked : target instanceof HTMLInputElement && (target.type === 'range' || target.type === 'number') || key === 'matchLength' ? Number(target.value) : target.value;
    (this.slot.settings as unknown as Record<string, unknown>)[key] = value;
    void this.persist(); this.applySettings();
    if (key === 'sound') this.game?.setSoundEnabled(Boolean(value));
  }
  private applySettings(): void {
    document.documentElement.dataset.quality = this.slot.settings.graphics;
  }
  private async persist(): Promise<void> { await saveSlot(this.slotId, this.slot); }
  private saveNow = (): void => { void this.persist(); };
  private handleVisibility = (): void => { if (document.hidden) void this.persist(); };
  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen?.(); else await document.documentElement.requestFullscreen?.();
  }

  private renderHome(): void {
    this.root.innerHTML = `
      <div class="app-shell home-shell">
        <header class="topbar"><div class="brand"><span class="brand-mark">F</span><div><b>FPS SOCCER</b><small>FIRST PERSON FOOTBALL</small></div></div><button class="icon-btn" data-view="settings" aria-label="Sozlamalar">⚙</button></header>
        <main class="home-content">
          <section class="hero-card"><div class="hero-copy"><div class="eyebrow">KARERA · MAVSUM ${this.slot.club.season}</div><h1>${this.escape(this.slot.club.identity.name)}</h1><p>Maydonga tush. Jamoangni boshqar. Tarix yarat.</p><button class="primary-btn" data-action="quick-match"><span>▶</span> TEZKOR O‘YIN</button></div><div class="hero-orb"><div class="orb-ring"></div><div class="hero-ball">⚽</div><div class="hero-stats"><b>${this.slot.club.leaguePoints}</b><small>JAMI OCHKO</small></div></div></section>
          <section class="overview-grid"><div class="overview-tile"><span>💰</span><small>Balans</small><b>${money(this.slot.club.balance)}</b></div><div class="overview-tile"><span>🏆</span><small>O‘yinlar</small><b>${this.slot.club.played} ta</b></div><div class="overview-tile"><span>⚡</span><small>Transfer budjeti</small><b>${money(this.slot.club.transferBudget)}</b></div></section>
          <section class="section-head"><div><div class="eyebrow">KLUB MARKAZI</div><h2>Jamoa boshqaruvi</h2></div><span class="section-count">${this.slot.club.squad.length} futbolchi</span></section>
          <section class="menu-grid">
            <button class="menu-card featured" data-view="play"><span class="menu-icon">⚽</span><b>O‘ynash</b><small>Uchrashuvlar va mashq</small><i>→</i></button>
            <button class="menu-card" data-view="squad"><span class="menu-icon">👥</span><b>Tarkib</b><small>Futbolchilar va rol</small><i>→</i></button>
            <button class="menu-card" data-view="transfers"><span class="menu-icon">↗</span><b>Transferlar</b><small>Bozor va skaut</small><i>→</i></button>
            <button class="menu-card" data-view="training"><span class="menu-icon">⚡</span><b>Rivojlantirish</b><small>Mashg‘ulot va forma</small><i>→</i></button>
            <button class="menu-card" data-view="tactics"><span class="menu-icon">▦</span><b>Taktika</b><small>Sxema va uslub</small><i>→</i></button>
            <button class="menu-card" data-view="career"><span class="menu-icon">🏆</span><b>Chempionat</b><small>Jadval va natijalar</small><i>→</i></button>
          </section>
          <section class="bottom-actions"><button class="secondary-btn" data-view="club">Klub profili</button><button class="secondary-btn" data-action="save">Saqlash</button><button class="secondary-btn" data-action="new-career">Yangi karera</button></section>
        </main>
        ${this.bottomNav('home')}
      </div>`;
  }

  private renderPlay(): void {
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">MAYDONGA CHIQ</div><h1>O‘yin rejimi</h1></div></header><main class="page-content"><div class="play-hero"><div class="eyebrow">OFFLINE MATCH ENGINE</div><h2>Har bir pasni his qil.</h2><p>Haqiqiy 3D maydon. Birinchi shaxs nigohi. 22 futbolchi va jonli boshqaruv.</p><button class="primary-btn" data-action="quick-match">UCHRASHUVNI BOSHLASH →</button></div><div class="mode-grid"><button class="mode-card" data-action="quick-match"><b>⚽ Tezkor uchrashuv</b><small>11 ga 11 · 2 bo‘lim</small></button><button class="mode-card" data-view="training"><b>🎯 Mashg‘ulot</b><small>Futbolchilarni rivojlantirish</small></button><button class="mode-card" data-view="career"><b>🏆 Karera</b><small>Chempionat jadvali</small></button></div></main>${this.bottomNav('play')}</div>`;
  }

  private renderClub(): void {
    const c = this.slot.club;
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">KLUB PROFILI</div><h1>${this.escape(c.identity.name)}</h1></div></header><main class="page-content"><section class="club-banner" style="--club:${c.identity.primary}"><div class="crest">${this.crest(c.identity.crest)}</div><div><div class="eyebrow">TASHKIL TOPGAN · 2026</div><h2>${this.escape(c.identity.name)}</h2><p>${c.manager.name} · ${c.formation}</p></div></section><div class="overview-grid"><div class="overview-tile"><small>Balans</small><b>${money(c.balance)}</b></div><div class="overview-tile"><small>Transfer</small><b>${money(c.transferBudget)}</b></div><div class="overview-tile"><small>Oylik maosh</small><b>${money(c.wageBudget)}</b></div></div><section class="panel"><div class="section-head"><h2>Klub ma’lumotlari</h2></div><div class="data-row"><span>Menejer</span><b>${this.escape(c.manager.name)} · ${c.manager.rating}</b></div><div class="data-row"><span>Taktik falsafa</span><b>${this.tacticLabel(c.manager.philosophy)}</b></div><div class="data-row"><span>Jamoa reytingi</span><b>${this.teamRating()}</b></div><div class="data-row"><span>O‘yinlar</span><b>${c.played} · ${c.wins}G ${c.draws}D ${c.losses}M</b></div></section><section class="panel"><div class="section-head"><h2>Menejerlar</h2><small>150 ming so‘m</small></div>${['Kamoliddin Rahimov','Rafael Mendez','Tomas Varga'].map((name, i) => `<div class="manager-row"><div class="avatar">${name.split(' ').map((v) => v[0]).join('')}</div><div class="grow"><b>${name}</b><small>${['Muvozanatli · 73 reyting','To‘p nazorati · 82 reyting','Yuqori pressing · 78 reyting'][i]}</small></div><button class="small-btn" data-action="select-manager" data-manager="${name}">Tayinlash</button></div>`).join('')}</section></main>${this.bottomNav('club')}</div>`;
  }

  private renderSquad(): void {
    const rows = this.slot.club.squad.map((p) => `<div class="player-row"><div class="player-rating">${p.overall}</div><div class="grow"><b>${this.escape(p.name)}</b><small>${p.position} · ${p.age} yosh · ${p.nationality}</small><div class="mini-progress"><i style="width:${p.morale}%"></i></div></div><div class="player-value"><b>${p.form}</b><small>forma</small></div><button class="dots-btn" data-action="set-captain" data-player-id="${p.id}" title="Sardor qilish">★</button><button class="dots-btn" data-action="sell-player" data-player-id="${p.id}" title="Sotish">↗</button></div>`).join('');
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">JAMOA TARKIBI</div><h1>Futbolchilar</h1></div><span class="header-pill">${this.slot.club.squad.length}/30</span></header><main class="page-content"><div class="squad-summary"><div><small>O‘rtacha reyting</small><b>${this.teamRating()}</b></div><div><small>Asosiy sxema</small><b>${this.slot.club.formation}</b></div><div><small>Sardor</small><b>${this.escape(this.slot.club.squad.find((p) => p.id === this.slot.club.captainId)?.name.split(' ')[0] ?? '—')}</b></div></div><div class="section-head"><h2>Asosiy tarkib va zaxira</h2><small>★ sardor · ↗ sotish</small></div><section class="player-list">${rows}</section></main>${this.bottomNav('squad')}</div>`;
  }

  private renderTransfers(filter = ''): void {
    this.marketSearch = filter;
    const filtered = this.slot.market.filter((p) => {
      const textMatch = `${p.name} ${p.position} ${p.nationality}`.toLowerCase().includes(filter.toLowerCase());
      const roleMatch = this.marketFilter === 'all' || (this.marketFilter === 'gk' ? p.position === 'GK' : this.marketFilter === 'def' ? ['CB','LB','RB'].includes(p.position) : this.marketFilter === 'mid' ? ['DM','CM','AM'].includes(p.position) : ['LW','RW','ST'].includes(p.position));
      return textMatch && roleMatch;
    });
    const players = filtered.sort((a,b) => this.marketSort === 'price' ? a.value - b.value : b.overall - a.overall).slice(0, 40);
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">SKAUTLAR TARMOĞI</div><h1>Transfer bozori</h1></div></header><main class="page-content"><div class="budget-banner"><div><small>TRANSFER BUDJETI</small><b>${money(this.slot.club.transferBudget)}</b></div><span>● LIVE MARKET</span></div><input class="search-input" data-market-search value="${this.escape(this.marketSearch)}" placeholder="Futbolchi, pozitsiya yoki davlat…"/><div class="market-filters"><button class="${this.marketFilter==='all'?'selected':''}" data-market-filter="all">Hammasi</button><button class="${this.marketFilter==='gk'?'selected':''}" data-market-filter="gk">GK</button><button class="${this.marketFilter==='def'?'selected':''}" data-market-filter="def">Himoya</button><button class="${this.marketFilter==='mid'?'selected':''}" data-market-filter="mid">Yarim himoya</button><button class="${this.marketFilter==='att'?'selected':''}" data-market-filter="att">Hujum</button><select data-market-sort aria-label="Saralash"><option value="overall" ${this.marketSort==='overall'?'selected':''}>Reyting bo‘yicha</option><option value="price" ${this.marketSort==='price'?'selected':''}>Narx bo‘yicha</option></select></div><section class="market-list">${players.length ? players.map((p) => `<div class="market-row"><div class="player-rating">${p.overall}</div><div class="grow"><b>${this.escape(p.name)}</b><small>${p.position} · ${p.age} yosh · ${p.nationality}</small><div class="potential">POT ${p.potential} <span>· ${p.contractYears} yil shartnoma</span></div></div><div class="market-price"><b>${money(p.value)}</b><button class="small-btn" data-action="buy-player" data-player-id="${p.id}">Sotib olish</button></div></div>`).join('') : '<div class="empty-state">Mos futbolchi topilmadi.</div>'}</section><p class="muted-note">Transferlar o‘yin ichidagi virtual klub mablag‘idan amalga oshiriladi. Haqiqiy pul ishlatilmaydi.</p></main>${this.bottomNav('transfers')}</div>`;
  }
  private filterMarket(value: string): void { if (this.view === 'transfers') this.renderTransfers(value); const input = $('[data-market-search]', this.root) as HTMLInputElement | null; if (input) { input.value = value; input.focus(); input.setSelectionRange(value.length, value.length); } }

  private renderTraining(): void {
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">RIVOJLANISH MARKAZI</div><h1>Mashg‘ulotlar</h1></div></header><main class="page-content"><div class="training-banner"><span>⚡</span><div><b>Individual mashg‘ulot</b><small>Har sessiya 12 000 so‘m. Charchoq oshadi, atributlar yaxshilanadi.</small></div></div><section class="player-list">${this.slot.club.squad.slice(0, 15).map((p) => `<div class="player-row"><div class="player-rating">${p.overall}</div><div class="grow"><b>${this.escape(p.name)}</b><small>${p.position} · ${p.age} yosh · Charchoq ${p.fatigue}%</small><div class="mini-progress"><i style="width:${p.fatigue}%;background:${p.fatigue > 65 ? '#dc6e58' : '#4fae91'}"></i></div></div><div class="train-actions"><button data-action="train-player" data-focus="technical" data-player-id="${p.id}">TEC</button><button data-action="train-player" data-focus="physical" data-player-id="${p.id}">PHY</button><button data-action="train-player" data-focus="defense" data-player-id="${p.id}">DEF</button></div></div>`).join('')}</section></main>${this.bottomNav('training')}</div>`;
  }

  private renderTactics(): void {
    const formations: FormationId[] = ['4-3-3','4-4-2','4-2-3-1','3-5-2','5-3-2','4-1-4-1'];
    const tactics: TacticalStyle[] = ['balanced','possession','counter','press','defensive','wide'];
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">TAKTIK TAHLIL</div><h1>Sxema va uslub</h1></div></header><main class="page-content"><section class="panel"><div class="section-head"><h2>Jamoa sxemasi</h2><span class="header-pill">${this.slot.club.formation}</span></div><div class="formation-preview">${Array.from({ length: 11 }, (_, i) => `<span class="dot-player" style="--x:${[50,20,40,60,80,32,50,68,20,50,80][i]}%;--y:${[8,25,25,25,25,48,48,48,78,88,78][i]}%">${i + 1}</span>`).join('')}</div><div class="formation-grid">${formations.map((f) => `<button class="choice ${this.slot.club.formation === f ? 'selected' : ''}" data-action="formation" data-formation="${f}">${f}</button>`).join('')}</div></section><section class="panel"><div class="section-head"><h2>Taktik falsafasi</h2></div><div class="tactic-grid">${tactics.map((t) => `<button class="tactic-choice ${this.slot.club.tactics === t ? 'selected' : ''}" data-action="tactic" data-tactic="${t}"><b>${this.tacticLabel(t)}</b><small>${this.tacticDescription(t)}</small></button>`).join('')}</div></section><button class="primary-btn full" data-action="save">TAKTIKANI SAQLASH</button></main>${this.bottomNav('tactics')}</div>`;
  }

  private renderCareer(): void {
    const standings = [...this.slot.standings].sort((a,b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">MILLIY LIGA</div><h1>Chempionat</h1></div></header><main class="page-content"><div class="season-card"><div><small>JORIY MAVSUM</small><b>${this.slot.club.season}-mavsum · ${this.slot.club.week}-hafta</b></div><span>2026/27</span></div><section class="panel"><div class="section-head"><h2>Turnir jadvali</h2><small>8 ta klub</small></div><div class="table-head"><span>#</span><span>Klub</span><span>O‘</span><span>F</span><span>O</span></div>${standings.map((s,i) => `<div class="standing-row ${s.club === this.slot.club.identity.name ? 'own-club' : ''}"><span>${i+1}</span><b>${this.escape(s.club)}</b><span>${s.played}</span><span>${s.goalsFor-s.goalsAgainst}</span><strong>${s.points}</strong></div>`).join('')}</section><section class="panel"><div class="section-head"><h2>Klub statistikasi</h2></div><div class="stats-grid"><div><b>${this.slot.club.wins}</b><small>G‘alaba</small></div><div><b>${this.slot.club.draws}</b><small>Durang</small></div><div><b>${this.slot.club.losses}</b><small>Mag‘lubiyat</small></div><div><b>${this.slot.club.goalsFor}</b><small>Urildi</small></div></div></section></main>${this.bottomNav('career')}</div>`;
  }

  private renderSettings(): void {
    const s = this.slot.settings;
    this.root.innerHTML = `<div class="app-shell"><header class="page-header"><button class="back-btn" data-action="back">‹</button><div><div class="eyebrow">MOSLASH</div><h1>Sozlamalar</h1></div></header><main class="page-content"><section class="panel settings-panel"><div class="setting-row"><div><b>Grafika sifati</b><small>Telefon unumdorligiga qarab tanlang</small></div><select data-setting="graphics"><option value="low" ${s.graphics==='low'?'selected':''}>LOW</option><option value="medium" ${s.graphics==='medium'?'selected':''}>MEDIUM</option><option value="high" ${s.graphics==='high'?'selected':''}>HIGH</option></select></div><div class="setting-row"><div><b>Uchrashuv uzunligi</b><small>Haqiqiy vaqt bo‘yicha</small></div><select data-setting="matchLength"><option value="3" ${s.matchLength===3?'selected':''}>3 daqiqa</option><option value="5" ${s.matchLength===5?'selected':''}>5 daqiqa</option><option value="8" ${s.matchLength===8?'selected':''}>8 daqiqa</option></select></div><div class="setting-row"><div><b>Boshqaruv sezgirligi</b><small>Kamera burilishi</small></div><input type="range" min="0.5" max="1.8" step="0.1" value="${s.sensitivity}" data-setting="sensitivity"></div><div class="setting-row"><div><b>Avtomatik futbolchi almashtirish</b><small>To‘p yaqinidagi futbolchiga o‘tish</small></div><input type="checkbox" ${s.autoSwitch?'checked':''} data-setting="autoSwitch"></div><div class="setting-row"><div><b>Ovoz</b><small>Tribuna va effektlar</small></div><input type="checkbox" ${s.sound?'checked':''} data-setting="sound"></div><div class="setting-row"><div><b>Til</b><small>Hozirda o‘zbekcha</small></div><select disabled><option>O‘zbekcha</option><option>English — keyinroq</option></select></div></section><button class="secondary-btn full" data-action="save">Saqlash</button><button class="danger-btn full" data-action="delete-career">Karerani tiklash</button><section class="about-note"><b>FPS Soccer · 0.1.0</b><p>Three.js · Rapier Physics · Capacitor</p><small>Internet talab qilmaydigan lokal karera. Barcha klub ma’lumotlari qurilmada saqlanadi.</small></section></main>${this.bottomNav('settings')}</div>`;
  }

  private matchTemplate(): string {
    return `<div class="match-screen"><canvas id="match-canvas"></canvas><div class="match-top"><div class="scoreboard"><div class="team-score"><span class="score-crest">${this.crest(this.slot.club.identity.crest)}</span><b id="score-home">0</b></div><div class="score-middle"><b id="match-clock">00:00</b><small id="match-half">1-BO‘LIM</small></div><div class="team-score away"><b id="score-away">0</b><span class="score-crest red">◈</span></div></div><button class="pause-btn" data-action="pause">Ⅱ</button></div><div class="match-event hidden" id="match-event"><b id="match-event-text"></b></div><div class="match-bottom"><div class="player-status"><div><small>BOSHQARUV</small><b id="controlled-name">Futbolchi</b></div><div class="stamina-track"><i id="stamina-fill"></i></div><small>STAMINA</small></div><div class="match-hints"><span>TO‘P NAZORATI</span><b id="possession-value">50%</b></div><div class="power-control"><span>KUCh</span><input type="range" min="15" max="100" value="62" data-aim-power /></div></div>
      <div class="mobile-controls"><div class="left-controls"><div class="joystick" data-joystick><div class="joystick-ring"></div><div class="joystick-knob" id="joystick-knob"></div></div><button class="sprint-btn" data-sprint>SPRINT</button></div><div class="right-controls"><button class="action-btn switch" data-game-action="switch"><b>⇄</b><small>ALMASHTIR</small></button><button class="action-btn" data-game-action="through"><b>↗</b><small>THROUGH</small></button><button class="action-btn" data-game-action="shoot"><b>◉</b><small>ZARBA</small></button><button class="action-btn" data-game-action="pass"><b>➤</b><small>PAS</small></button><button class="action-btn" data-game-action="long"><b>⌁</b><small>UZATMA</small></button><button class="action-btn" data-game-action="skill"><b>✦</b><small>FINT</small></button><button class="action-btn tackle" data-game-action="tackle"><b>⚑</b><small>TAKL</small></button></div></div>
      <div class="overlay hidden" id="pause-overlay"><div class="overlay-card"><div class="eyebrow">PAUZA</div><h2>O‘yin to‘xtatildi</h2><button class="primary-btn full" data-action="resume">DAVOM ETISH</button><button class="secondary-btn full" data-action="end-match">Uchrashuvni yakunlash</button></div></div>
      <div class="overlay hidden" id="halftime-overlay"><div class="overlay-card halftime-card"><div class="eyebrow">45-DAQIQA</div><h2>Tanaffus</h2><p>Futbolchilar biroz dam olmoqda…</p></div></div>
      <div class="overlay hidden" id="result-overlay"></div>
      <button class="fullscreen-btn" data-action="fullscreen">⛶</button>
    </div>`;
  }

  private bottomNav(active: string): string {
    const items = [{ id: 'home', label: 'Bosh sahifa', icon: '⌂' }, { id: 'play', label: 'O‘yin', icon: '⚽' }, { id: 'squad', label: 'Tarkib', icon: '♟' }, { id: 'club', label: 'Klub', icon: '▣' }];
    return `<nav class="bottom-nav">${items.map((item) => `<button class="${active === item.id ? 'active' : ''}" data-view="${item.id}"><span>${item.icon}</span><small>${item.label}</small></button>`).join('')}</nav>`;
  }

  private crest(style: string): string { return style === 'star' ? '✦' : style === 'shield' ? '⬟' : '◈'; }
  private teamRating(): number { return Math.round(this.slot.club.squad.slice(0,11).reduce((a,p) => a+p.overall,0)/Math.max(1,Math.min(11,this.slot.club.squad.length))); }
  private tacticLabel(t: TacticalStyle): string { return ({ balanced: 'Muvozanatli', possession: 'To‘p nazorati', counter: 'Qarshi hujum', press: 'Yuqori pressing', defensive: 'Himoyaviy', wide: 'Qanotlardan hujum' })[t]; }
  private tacticDescription(t: TacticalStyle): string { return ({ balanced: 'Himoya va hujum o‘rtasida muvozanat', possession: 'Qisqa paslar va to‘pni saqlash', counter: 'Tezkor hujum va bo‘sh hudud', press: 'Raqibga yuqoridan bosim', defensive: 'Chuqur himoya va zich blok', wide: 'Qanotlar orqali keng hujum' })[t]; }
  private escape(value: string): string { return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
  private showToast(message: string): void {
    let toast = $('#app-toast', this.root);
    if (!toast) { toast = document.createElement('div'); toast.id = 'app-toast'; toast.className = 'toast'; this.root.append(toast); }
    toast.textContent = message; toast.classList.add('visible');
    window.setTimeout(() => toast?.classList.remove('visible'), 2200);
  }

  destroy(): void {
    clearInterval(this.saveTimer); this.stopMatch(); document.removeEventListener('visibilitychange', this.handleVisibility);
    window.removeEventListener('beforeunload', this.saveNow); window.removeEventListener('keydown', this.onKeyDown); window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove); window.removeEventListener('pointerup', this.onPointerUp); window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
