export type TeamSide = 'home' | 'away';
export type Position = 'GK' | 'CB' | 'LB' | 'RB' | 'DM' | 'CM' | 'AM' | 'LW' | 'RW' | 'ST';
export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '5-3-2' | '4-1-4-1';
export type TacticalStyle = 'possession' | 'counter' | 'press' | 'defensive' | 'balanced' | 'wide';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface PlayerAttributes {
  speed: number;
  acceleration: number;
  stamina: number;
  dribbling: number;
  control: number;
  passing: number;
  shooting: number;
  finishing: number;
  shotPower: number;
  defense: number;
  tackling: number;
  positioning: number;
  strength: number;
  reflexes: number;
  handling: number;
}

export interface PlayerProfile {
  id: string;
  name: string;
  nationality: string;
  age: number;
  position: Position;
  number: number;
  overall: number;
  potential: number;
  attributes: PlayerAttributes;
  value: number;
  wage: number;
  contractYears: number;
  morale: number;
  form: number;
  fatigue: number;
  injuredDays: number;
  appearances: number;
  goals: number;
  assists: number;
}

export interface ClubIdentity {
  name: string;
  shortName: string;
  primary: string;
  secondary: string;
  crest: string;
}

export interface ManagerProfile {
  name: string;
  philosophy: TacticalStyle;
  experience: number;
  rating: number;
  trainingBonus: number;
  developmentBonus: number;
}

export interface ClubState {
  identity: ClubIdentity;
  squad: PlayerProfile[];
  formation: FormationId;
  tactics: TacticalStyle;
  captainId: string;
  manager: ManagerProfile;
  balance: number;
  wageBudget: number;
  transferBudget: number;
  season: number;
  week: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leaguePoints: number;
  transferHistory: string[];
}

export interface CareerStanding {
  club: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface GameSettings {
  graphics: 'low' | 'medium' | 'high';
  matchLength: 3 | 5 | 8;
  sensitivity: number;
  autoSwitch: boolean;
  sound: boolean;
  crowdVolume: number;
  effectsVolume: number;
  language: 'uz' | 'en';
}

export interface SaveSlot {
  version: number;
  updatedAt: number;
  club: ClubState;
  settings: GameSettings;
  standings: CareerStanding[];
  market: PlayerProfile[];
}

export interface MatchSnapshot {
  homeGoals: number;
  awayGoals: number;
  elapsedSeconds: number;
  half: 1 | 2;
  possessionHome: number;
  shotsHome: number;
  shotsAway: number;
  shotsOnTargetHome: number;
  shotsOnTargetAway: number;
}

export interface MatchHud {
  home: number;
  away: number;
  clock: string;
  half: string;
  player: string;
  stamina: number;
  possession: string;
  event: string;
  target?: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  graphics: 'medium', matchLength: 5, sensitivity: 1, autoSwitch: true,
  sound: true, crowdVolume: 0.35, effectsVolume: 0.65, language: 'uz',
};
