import { createInitialSquad, createTransferMarket } from '../data/players';
import type { CareerStanding, ClubState, FormationId, GameSettings, PlayerProfile, SaveSlot, TacticalStyle } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';

export const SAVE_VERSION = 2;
const defaultManager = { name: 'Kamoliddin Rahimov', philosophy: 'balanced' as TacticalStyle, experience: 8, rating: 73, trainingBonus: 4, developmentBonus: 3 };

export function createNewCareer(clubName = 'Zarafshon FC'): SaveSlot {
  const squad = createInitialSquad();
  const club: ClubState = {
    identity: { name: clubName.trim().slice(0, 28) || 'Zarafshon FC', shortName: 'ZFC', primary: '#28a9ff', secondary: '#f6f8fc', crest: 'star' },
    squad, formation: '4-3-3', tactics: 'balanced', captainId: squad[7]!.id, manager: { ...defaultManager },
    balance: 12_500_000, wageBudget: 320_000, transferBudget: 9_000_000,
    season: 1, week: 1, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, leaguePoints: 0, transferHistory: [],
  };
  const standings = [club.identity.name, 'Toshkent United', 'Buxoro Athletic', 'Samarqand City', 'Farg‘ona Stars', 'Qarshi FC', 'Andijon 1912', 'Navbahor'].map((name) => ({
    club: name, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
  }));
  return { version: SAVE_VERSION, updatedAt: Date.now(), club, settings: { ...DEFAULT_SETTINGS }, standings, market: createTransferMarket() };
}

export function validateAndMigrate(input: unknown): SaveSlot {
  if (!input || typeof input !== 'object') throw new Error('Saqlangan karera ma’lumoti noto‘g‘ri.');
  const raw = input as Partial<SaveSlot>;
  if (!raw.club || !Array.isArray(raw.club.squad) || !raw.club.identity) throw new Error('Karera faylida klub yoki tarkib topilmadi.');
  const fallback = createNewCareer(raw.club.identity.name ?? 'Zarafshon FC');
  const migrated: SaveSlot = {
    version: SAVE_VERSION,
    updatedAt: Number(raw.updatedAt) || Date.now(),
    club: { ...fallback.club, ...raw.club, identity: { ...fallback.club.identity, ...raw.club.identity }, manager: { ...fallback.club.manager, ...raw.club.manager } },
    settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    standings: Array.isArray(raw.standings) ? raw.standings : fallback.standings,
    market: Array.isArray(raw.market) ? raw.market : fallback.market,
  };
  if (!migrated.club.squad.every((p) => p && typeof p.id === 'string' && typeof p.overall === 'number')) {
    throw new Error('Tarkibdagi futbolchi yozuvi buzilgan.');
  }
  return migrated;
}

export function canAfford(club: ClubState, price: number): boolean {
  return Number.isFinite(price) && price >= 0 && club.transferBudget >= price && club.balance >= price;
}

export function buyPlayer(slot: SaveSlot, playerId: string, offeredPrice?: number): SaveSlot {
  const marketPlayer = slot.market.find((p) => p.id === playerId);
  if (!marketPlayer) throw new Error('Bu futbolchi transfer bozorida topilmadi.');
  const price = Math.max(0, Math.round(offeredPrice ?? marketPlayer.value));
  if (!canAfford(slot.club, price)) throw new Error('Transfer budjeti yetarli emas.');
  if (slot.club.squad.length >= 30) throw new Error('Tarkib 30 futbolchidan oshmasligi kerak.');
  const bought: PlayerProfile = { ...marketPlayer, id: `owned-${marketPlayer.id}`, contractYears: 4, morale: 76, fatigue: 0 };
  const next: SaveSlot = structuredClone(slot);
  next.club.squad.push(bought);
  next.club.balance -= price;
  next.club.transferBudget -= price;
  next.market = next.market.filter((p) => p.id !== playerId);
  next.club.transferHistory.unshift(`${bought.name} — ${formatMoney(price)} evaziga sotib olindi`);
  next.updatedAt = Date.now();
  return next;
}

export function sellPlayer(slot: SaveSlot, playerId: string): SaveSlot {
  if (slot.club.squad.length <= 11) throw new Error('Asosiy tarkib soni 11 nafardan kam bo‘la olmaydi.');
  if (playerId === slot.club.captainId) throw new Error('Avval boshqa sardor tayinlang.');
  const player = slot.club.squad.find((p) => p.id === playerId);
  if (!player) throw new Error('Futbolchi topilmadi.');
  const fee = Math.round(player.value * 0.78);
  const next = structuredClone(slot);
  next.club.squad = next.club.squad.filter((p) => p.id !== playerId);
  next.club.balance += fee;
  next.club.transferBudget += Math.round(fee * 0.6);
  next.market.push({ ...player, id: `listed-${player.id}`, value: fee });
  next.club.transferHistory.unshift(`${player.name} — ${formatMoney(fee)} evaziga sotildi`);
  next.updatedAt = Date.now();
  return next;
}

export function trainPlayer(slot: SaveSlot, playerId: string, focus: 'technical' | 'physical' | 'defense'): SaveSlot {
  const next = structuredClone(slot);
  const player = next.club.squad.find((p) => p.id === playerId);
  if (!player) throw new Error('Futbolchi topilmadi.');
  if (player.injuredDays > 0) throw new Error('Jarohatlangan futbolchi mashg‘ulotda qatnasha olmaydi.');
  const cost = 12_000;
  if (next.club.balance < cost) throw new Error('Mashg‘ulot uchun mablag‘ yetarli emas.');
  const increment = player.age < 23 ? 1.25 : 0.65;
  const keys = focus === 'technical' ? ['passing', 'control', 'dribbling'] : focus === 'physical' ? ['speed', 'stamina', 'strength'] : ['defense', 'tackling', 'positioning'];
  for (const key of keys as (keyof typeof player.attributes)[]) player.attributes[key] = Math.min(99, player.attributes[key] + increment);
  player.overall = Math.min(99, player.overall + (player.potential > player.overall ? 1 : 0));
  player.fatigue = Math.min(100, player.fatigue + 12);
  next.club.balance -= cost;
  next.updatedAt = Date.now();
  return next;
}

export function changeTactics(slot: SaveSlot, formation: FormationId, tactics: TacticalStyle): SaveSlot {
  const next = structuredClone(slot);
  next.club.formation = formation;
  next.club.tactics = tactics;
  next.updatedAt = Date.now();
  return next;
}

export function finishCareerMatch(slot: SaveSlot, goalsFor: number, goalsAgainst: number): SaveSlot {
  const next = structuredClone(slot);
  next.club.played++;
  next.club.goalsFor += goalsFor;
  next.club.goalsAgainst += goalsAgainst;
  if (goalsFor > goalsAgainst) { next.club.wins++; next.club.leaguePoints += 3; }
  else if (goalsFor === goalsAgainst) { next.club.draws++; next.club.leaguePoints++; }
  else next.club.losses++;
  next.club.week++;
  for (const player of next.club.squad) {
    player.fatigue = Math.max(0, player.fatigue - 18);
    player.injuredDays = Math.max(0, player.injuredDays - 7);
  }
  next.club.balance += goalsFor > goalsAgainst ? 180_000 : goalsFor === goalsAgainst ? 90_000 : 45_000;
  next.standings[0] = { club: next.club.identity.name, played: next.club.played, wins: next.club.wins, draws: next.club.draws, losses: next.club.losses, goalsFor: next.club.goalsFor, goalsAgainst: next.club.goalsAgainst, points: next.club.leaguePoints };
  next.standings.sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));
  next.updatedAt = Date.now();
  return next;
}

export function formatMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} mln`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} ming`;
  return `${value.toLocaleString('uz-UZ')} so‘m`;
}

export function defaultSettings(): GameSettings { return { ...DEFAULT_SETTINGS }; }
