import { describe, expect, it } from 'vitest';
import { createNewCareer, validateAndMigrate, buyPlayer, sellPlayer, trainPlayer, finishCareerMatch, canAfford } from '../src/management/club';
import { overallFromAttributes } from '../src/data/players';
import { getFormation } from '../src/game/match/formation';

describe('FPS Soccer career domain', () => {
  it('creates a valid offline career with a 23-player squad', () => {
    const slot = createNewCareer('Zarafshon FC');
    expect(slot.club.squad).toHaveLength(23);
    expect(slot.club.identity.name).toBe('Zarafshon FC');
    expect(slot.market.length).toBeGreaterThan(30);
    expect(slot.version).toBe(2);
  });

  it('calculates an overall rating using role-specific weights', () => {
    const keeper = createNewCareer().club.squad[0]!;
    const original = overallFromAttributes(keeper.attributes, 'GK');
    const strongerHands = { ...keeper.attributes, handling: 99, reflexes: 99 };
    expect(overallFromAttributes(strongerHands, 'GK')).toBeGreaterThan(original);
  });

  it('buys a market player as an atomic budget and roster transaction', () => {
    const slot = createNewCareer();
    const playerId = slot.market[0]!.id;
    const oldBalance = slot.club.balance;
    const price = slot.market[0]!.value;
    const next = buyPlayer(slot, playerId);
    expect(next.club.squad).toHaveLength(24);
    expect(next.club.balance).toBe(oldBalance - price);
    expect(next.market.some((p) => p.id === playerId)).toBe(false);
    expect(slot.club.squad).toHaveLength(23);
  });

  it('rejects a transfer which exceeds the budget without mutating the save', () => {
    const slot = createNewCareer();
    const player = slot.market[0]!;
    expect(() => buyPlayer(slot, player.id, slot.club.transferBudget + 1)).toThrow(/budjeti/);
    expect(slot.club.squad).toHaveLength(23);
  });

  it('sells a squad player and credits the club', () => {
    const slot = createNewCareer();
    const player = slot.club.squad[22]!;
    const next = sellPlayer(slot, player.id);
    expect(next.club.squad).toHaveLength(22);
    expect(next.club.balance).toBeGreaterThan(slot.club.balance);
  });

  it('does not allow selling below the minimum squad size', () => {
    const slot = createNewCareer();
    slot.club.squad = slot.club.squad.slice(0, 11);
    expect(() => sellPlayer(slot, slot.club.squad[10]!.id)).toThrow(/kam/);
  });

  it('trains a player, charges the club, and applies fatigue', () => {
    const slot = createNewCareer();
    const player = slot.club.squad[6]!;
    const oldPassing = player.attributes.passing;
    const next = trainPlayer(slot, player.id, 'technical');
    const trained = next.club.squad.find((p) => p.id === player.id)!;
    expect(trained.attributes.passing).toBeGreaterThan(oldPassing);
    expect(trained.fatigue).toBeGreaterThan(player.fatigue);
    expect(next.club.balance).toBe(slot.club.balance - 12_000);
  });

  it('rejects training injured players', () => {
    const slot = createNewCareer();
    slot.club.squad[0]!.injuredDays = 4;
    expect(() => trainPlayer(slot, slot.club.squad[0]!.id, 'physical')).toThrow(/Jarohat/);
  });

  it('awards league points and updates goals and standings', () => {
    const slot = createNewCareer();
    const next = finishCareerMatch(slot, 3, 1);
    expect(next.club.played).toBe(1);
    expect(next.club.wins).toBe(1);
    expect(next.club.leaguePoints).toBe(3);
    expect(next.club.goalsFor).toBe(3);
    expect(next.standings[0]!.club).toBe(next.club.identity.name);
  });

  it('supports draw and loss scoring correctly', () => {
    let slot = createNewCareer();
    slot = finishCareerMatch(slot, 2, 2);
    expect(slot.club.leaguePoints).toBe(1);
    slot = finishCareerMatch(slot, 0, 1);
    expect(slot.club.leaguePoints).toBe(1);
    expect(slot.club.losses).toBe(1);
  });

  it('migrates old saves and repairs optional defaults', () => {
    const old = createNewCareer();
    const migrated = validateAndMigrate({ version: 1, club: old.club, updatedAt: 123 });
    expect(migrated.version).toBe(2);
    expect(migrated.settings.graphics).toBe('medium');
    expect(migrated.market.length).toBeGreaterThan(0);
  });

  it('rejects structurally corrupted saves', () => {
    expect(() => validateAndMigrate({ club: { squad: 'broken' } })).toThrow();
  });

  it('returns eleven formation slots and mirrors away positions', () => {
    const home = getFormation('4-3-3', 'home');
    const away = getFormation('4-3-3', 'away');
    expect(home).toHaveLength(11);
    expect(away).toHaveLength(11);
    expect(away[0]!.x).toBe(-home[0]!.x);
  });

  it('checks transfer budget boundaries', () => {
    const club = createNewCareer().club;
    expect(canAfford(club, club.transferBudget)).toBe(true);
    expect(canAfford(club, club.transferBudget + 1)).toBe(false);
    expect(canAfford(club, -1)).toBe(false);
  });
});
