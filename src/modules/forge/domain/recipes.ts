/**
 * Catalogue des recettes de la Forge.
 * Domaine pur : aucune dépendance technique.
 */

export type Amounts = Partial<Record<'wood' | 'stone' | 'gold', number>>

export type RecipeId = 'sword' | 'shield' | 'armor' | 'pickaxe' | 'axe' | 'crown'

export interface RecipeEffect {
  attack?: number
  defense?: number
  hp?: number
  production?: Amounts
  special?: string
  label: string
}

export interface Recipe {
  id: RecipeId
  name: string
  description: string
  cost: Amounts
  durationMs: number
  effect: RecipeEffect
}

export const RECIPES: Record<RecipeId, Recipe> = {
  sword: {
    id: 'sword',
    name: 'Épée de fer',
    description: 'Une lame d’acier forgée pour pourfendre les monstres.',
    cost: { wood: 20, stone: 10 },
    durationMs: 5_000,
    effect: {
      attack: 6,
      label: '+6 Attaque',
    },
  },
  shield: {
    id: 'shield',
    name: 'Bouclier runique',
    description: 'Un bouclier solide renforcé de runes protectrices.',
    cost: { wood: 30, stone: 20 },
    durationMs: 10_000,
    effect: {
      defense: 4,
      label: '+4 Défense',
    },
  },
  armor: {
    id: 'armor',
    name: 'Plastron d’acier',
    description: 'Une armure impénétrable garantissant une haute défense.',
    cost: { wood: 10, stone: 40, gold: 5 },
    durationMs: 15_000,
    effect: {
      defense: 3,
      hp: 15,
      label: '+15 PV max, +3 Défense',
    },
  },
  pickaxe: {
    id: 'pickaxe',
    name: 'Pioche de maître',
    description: 'Un outil forgé pour creuser plus efficacement la roche.',
    cost: { wood: 25, stone: 15 },
    durationMs: 8_000,
    effect: {
      attack: 2,
      production: { stone: 3 },
      special: '+3 Pierre/min au Village',
      label: '+3 Pierre/min, +2 Attaque',
    },
  },
  axe: {
    id: 'axe',
    name: 'Hache de bûcheron',
    description: 'Un outil forgé pour abattre les troncs et accélérer la coupe du bois.',
    cost: { wood: 15, stone: 15 },
    durationMs: 6_000,
    effect: {
      attack: 3,
      production: { wood: 5 },
      special: '+5 Bois/min au Village',
      label: '+5 Bois/min, +3 Attaque',
    },
  },
  crown: {
    id: 'crown',
    name: 'Couronne royale',
    description: 'Un symbole de majesté réservé aux seigneurs les plus fortunés.',
    cost: { wood: 10, stone: 20, gold: 50 },
    durationMs: 20_000,
    effect: {
      attack: 4,
      defense: 3,
      hp: 10,
      production: { gold: 1 },
      special: 'Prestige royal (+10% butin Donjon)',
      label: '+1 Or/min, +4 Attaque, +3 Défense, +10 PV',
    },
  },
}

export const RECIPE_IDS: RecipeId[] = ['sword', 'shield', 'armor', 'pickaxe', 'axe', 'crown']

export function isRecipeId(id: string): id is RecipeId {
  return (RECIPE_IDS as string[]).includes(id)
}
