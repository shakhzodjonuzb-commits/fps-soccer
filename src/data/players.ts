import type { PlayerAttributes, PlayerProfile, Position } from '../shared/types';

const names = [
  'Azizbek Karimov','Jasurbek Aliyev','Sardor Rahimov','Diyorbek Umarov','Bekzod Ergashev',
  'Otabek Ismoilov','Muhammadali Qodirov','Javohir Tursunov','Asadbek Norboyev','Bobur Mamatqulov',
  'Ibrohim Abdullayev','Kamron Yoqubov','Temurbek Xasanov','Mirjalol Nazarov','Shoxrux Eshonqulov',
  'Suhrob To‘xtayev','Farrux Raxmonov','Umidjon Gʻaniyev','Sherzod Saidov','Oybek Jo‘rayev',
  'Nodirbek Mahmudov','Murodjon Xolmatov','Islom Akbarov','Davronbek Oripov','Sanjar Bekmurodov',
  'Eldor Sattorov','Akmaljon Xudoyberdiyev','Rustam Gʻaniyev','Yusuf Ali','Sirojiddin Mirzayev',
  'Daniel Moreau','Lucas Ferreira','Mateo Kovac','Niko Petrov','Emir Demir','Noah Williams',
  'Diego Alvarez','Leon Fischer','Milan Jovanovic','Rafael Costa','Adam Nowak','Omar Haddad',
];
const countries = ['UZB','UZB','UZB','UZB','UZB','UZB','UZB','UZB','UZB','UZB','FRA','BRA','CRO','SRB','TUR','ENG','ESP','GER','SRB','POR','POL','MAR'];
const positions: Position[] = ['GK','CB','CB','LB','RB','DM','CM','CM','AM','LW','RW','ST','ST','CB','CM','LW','RW','GK','DM','AM'];
const clamp = (n: number, lo = 35, hi = 97) => Math.max(lo, Math.min(hi, Math.round(n)));
const makeAttributes = (overall: number, position: Position, seed: number): PlayerAttributes => {
  const wave = (k: number) => Math.sin((seed + 1) * (k + 2) * 1.731) * 8;
  const base: PlayerAttributes = {
    speed: overall + wave(0), acceleration: overall + wave(1), stamina: overall + wave(2),
    dribbling: overall + wave(3), control: overall + wave(4), passing: overall + wave(5),
    shooting: overall + wave(6), finishing: overall + wave(7), shotPower: overall + wave(8),
    defense: overall + wave(9), tackling: overall + wave(10), positioning: overall + wave(11),
    strength: overall + wave(12), reflexes: overall + wave(13), handling: overall + wave(14),
  };
  if (position === 'GK') {
    base.reflexes += 22; base.handling += 19; base.defense += 7; base.shooting -= 32;
    base.dribbling -= 20; base.passing -= 5;
  } else if (['CB','LB','RB','DM'].includes(position)) {
    base.defense += 15; base.tackling += 14; base.strength += 8; base.finishing -= 12;
  } else if (['LW','RW','ST','AM'].includes(position)) {
    base.speed += 10; base.dribbling += 12; base.finishing += 13; base.defense -= 12;
  } else {
    base.passing += 10; base.stamina += 8; base.control += 6;
  }
  for (const key of Object.keys(base) as (keyof PlayerAttributes)[]) base[key] = clamp(base[key]);
  return base;
};

export function createPlayer(seed: number, opts: Partial<PlayerProfile> = {}): PlayerProfile {
  const overall = opts.overall ?? clamp(62 + ((seed * 17) % 30), 56, 91);
  const position = opts.position ?? positions[seed % positions.length]!;
  const age = opts.age ?? 18 + (seed * 7) % 16;
  return {
    id: opts.id ?? `p-${seed}-${(seed * 7919).toString(36)}`,
    name: opts.name ?? names[seed % names.length]!, nationality: opts.nationality ?? countries[seed % countries.length]!,
    age, position, number: opts.number ?? (seed % 99) + 1, overall,
    potential: opts.potential ?? clamp(overall + 4 + (seed % 18), overall, 98),
    attributes: opts.attributes ?? makeAttributes(overall, position, seed),
    value: opts.value ?? Math.round(overall * overall * 1850), wage: opts.wage ?? Math.round(overall * 115),
    contractYears: opts.contractYears ?? 2 + (seed % 4), morale: opts.morale ?? 78,
    form: opts.form ?? 68, fatigue: opts.fatigue ?? 8, injuredDays: opts.injuredDays ?? 0,
    appearances: opts.appearances ?? 0, goals: opts.goals ?? 0, assists: opts.assists ?? 0,
  };
}

export function createInitialSquad(): PlayerProfile[] {
  return Array.from({ length: 23 }, (_, i) => {
    const fixedPos = positions[i % positions.length]!;
    const overall = i < 11 ? 72 + ((i * 3) % 9) : 59 + ((i * 5) % 15);
    return createPlayer(i + 1, { position: fixedPos, overall, number: i + 1, potential: Math.min(96, overall + 8 + (i % 8)) });
  });
}

export function createTransferMarket(): PlayerProfile[] {
  return Array.from({ length: 54 }, (_, i) => {
    const overall = 57 + ((i * 11 + 3) % 34);
    const age = 17 + ((i * 5 + 2) % 20);
    return createPlayer(i + 110, {
      overall, age, value: Math.round(overall * overall * (age < 22 ? 2300 : 1650)),
      nationality: countries[(i * 3) % countries.length]!,
    });
  });
}

export function overallFromAttributes(a: PlayerAttributes, position: Position): number {
  const weights: Record<Position, Partial<Record<keyof PlayerAttributes, number>>> = {
    GK: { reflexes: .28, handling: .24, positioning: .16, defense: .12, passing: .1, strength: .1 },
    CB: { defense: .24, tackling: .2, strength: .15, positioning: .16, speed: .1, passing: .08, stamina: .07 },
    LB: { speed: .17, stamina: .15, defense: .18, tackling: .14, passing: .14, dribbling: .12, positioning: .1 },
    RB: { speed: .17, stamina: .15, defense: .18, tackling: .14, passing: .14, dribbling: .12, positioning: .1 },
    DM: { defense: .2, tackling: .18, passing: .17, stamina: .15, positioning: .12, strength: .1, control: .08 },
    CM: { passing: .2, control: .18, stamina: .15, positioning: .13, dribbling: .12, defense: .12, shooting: .1 },
    AM: { passing: .2, dribbling: .2, control: .18, positioning: .14, shooting: .12, finishing: .1, speed: .06 },
    LW: { speed: .2, dribbling: .2, acceleration: .14, finishing: .15, control: .12, passing: .1, shooting: .09 },
    RW: { speed: .2, dribbling: .2, acceleration: .14, finishing: .15, control: .12, passing: .1, shooting: .09 },
    ST: { finishing: .25, shooting: .18, positioning: .18, strength: .12, speed: .1, control: .1, acceleration: .07 },
  };
  const entries = Object.entries(weights[position]) as [keyof PlayerAttributes, number][];
  return Math.round(entries.reduce((sum, [key, weight]) => sum + a[key] * weight, 0));
}
