import type { FormationId, Position } from '../../shared/types';

export interface FormationPoint { position: Position; x: number; z: number; }
const layouts: Record<FormationId, FormationPoint[]> = {
  '4-3-3': [
    { position: 'GK', x: -49, z: 0 }, { position: 'LB', x: -32, z: -25 }, { position: 'CB', x: -35, z: -8 },
    { position: 'CB', x: -35, z: 8 }, { position: 'RB', x: -32, z: 25 }, { position: 'CM', x: -12, z: -16 },
    { position: 'DM', x: -16, z: 0 }, { position: 'CM', x: -12, z: 16 }, { position: 'LW', x: 15, z: -23 },
    { position: 'ST', x: 21, z: 0 }, { position: 'RW', x: 15, z: 23 },
  ],
  '4-4-2': [
    { position: 'GK', x: -49, z: 0 }, { position: 'LB', x: -32, z: -25 }, { position: 'CB', x: -35, z: -8 },
    { position: 'CB', x: -35, z: 8 }, { position: 'RB', x: -32, z: 25 }, { position: 'LW', x: -12, z: -25 },
    { position: 'CM', x: -15, z: -8 }, { position: 'CM', x: -15, z: 8 }, { position: 'RW', x: -12, z: 25 },
    { position: 'ST', x: 18, z: -9 }, { position: 'ST', x: 18, z: 9 },
  ],
  '4-2-3-1': [
    { position: 'GK', x: -49, z: 0 }, { position: 'LB', x: -32, z: -25 }, { position: 'CB', x: -35, z: -8 },
    { position: 'CB', x: -35, z: 8 }, { position: 'RB', x: -32, z: 25 }, { position: 'DM', x: -19, z: -10 },
    { position: 'DM', x: -19, z: 10 }, { position: 'LW', x: 5, z: -24 }, { position: 'AM', x: 4, z: 0 },
    { position: 'RW', x: 5, z: 24 }, { position: 'ST', x: 22, z: 0 },
  ],
  '3-5-2': [
    { position: 'GK', x: -49, z: 0 }, { position: 'CB', x: -35, z: -17 }, { position: 'CB', x: -37, z: 0 },
    { position: 'CB', x: -35, z: 17 }, { position: 'LW', x: -9, z: -29 }, { position: 'CM', x: -14, z: -13 },
    { position: 'DM', x: -17, z: 0 }, { position: 'CM', x: -14, z: 13 }, { position: 'RW', x: -9, z: 29 },
    { position: 'ST', x: 19, z: -9 }, { position: 'ST', x: 19, z: 9 },
  ],
  '5-3-2': [
    { position: 'GK', x: -49, z: 0 }, { position: 'LB', x: -35, z: -28 }, { position: 'CB', x: -39, z: -14 },
    { position: 'CB', x: -39, z: 0 }, { position: 'CB', x: -39, z: 14 }, { position: 'RB', x: -35, z: 28 },
    { position: 'CM', x: -12, z: -15 }, { position: 'CM', x: -17, z: 0 }, { position: 'CM', x: -12, z: 15 },
    { position: 'ST', x: 18, z: -9 }, { position: 'ST', x: 18, z: 9 },
  ],
  '4-1-4-1': [
    { position: 'GK', x: -49, z: 0 }, { position: 'LB', x: -32, z: -25 }, { position: 'CB', x: -35, z: -8 },
    { position: 'CB', x: -35, z: 8 }, { position: 'RB', x: -32, z: 25 }, { position: 'DM', x: -19, z: 0 },
    { position: 'LW', x: -1, z: -24 }, { position: 'CM', x: -5, z: -8 }, { position: 'CM', x: -5, z: 8 },
    { position: 'RW', x: -1, z: 24 }, { position: 'ST', x: 20, z: 0 },
  ],
};

export function getFormation(id: FormationId, side: 'home' | 'away'): FormationPoint[] {
  const direction = side === 'home' ? 1 : -1;
  return layouts[id].map((point) => ({ ...point, x: point.x * direction }));
}
