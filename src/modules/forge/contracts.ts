/**
 * Entrée publique « partagée » du module Forge : utilisable par le serveur
 * comme par l'interface.
 */

import { z } from 'zod'
import type { CraftError, CraftStatus } from './domain/craft'
import {
  type Amounts,
  RECIPE_IDS,
  RECIPES,
  type Recipe,
  type RecipeEffect,
  type RecipeId,
} from './domain/recipes'
import {
  BASE_HERO_STATS,
  type CombatStats,
  calculatePlayerStats,
  type HeroStatsOverview,
  MAX_EQUIPMENT_RAIDS,
  TOOL_DURATION_MS,
} from './domain/stats'
import type { CraftView } from './domain/view'

export type {
  Amounts,
  CombatStats,
  CraftError,
  CraftStatus,
  CraftView,
  HeroStatsOverview,
  Recipe,
  RecipeEffect,
  RecipeId,
}
export {
  BASE_HERO_STATS,
  calculatePlayerStats,
  MAX_EQUIPMENT_RAIDS,
  RECIPE_IDS,
  RECIPES,
  TOOL_DURATION_MS,
}

/** Corps attendu pour lancer une fabrication : une recette valide du catalogue. */
export const StartCraftInput = z.object({
  recipeId: z.enum(RECIPE_IDS as [RecipeId, ...RecipeId[]]),
})
export type StartCraftInput = z.infer<typeof StartCraftInput>

/** Résumé d'une fabrication dans la liste ou l'inventaire. */
export interface ForgeCraftSummary {
  craftId: string
  recipeId: RecipeId
  recipeName: string
  status: CraftStatus
  isReady: boolean
  cost: Amounts
  startedAt: number
  readyAt: number
  remainingMs: number
  completedAt: number | null
  raidsUsed: number
  raidsRemaining: number
  isExpired: boolean
  expiresAt: number | null
}

/** Vue globale de la Forge renvoyée par l'API. */
export interface ForgeOverview {
  recipes: Recipe[]
  crafts: ForgeCraftSummary[]
  inventory: ForgeCraftSummary[]
  stats: HeroStatsOverview
}

/** Préfixe commun aux noms des flux de toutes les fabrications. */
export const FORGE_STREAM_PREFIX = 'forge-'

/** Nom du flux qui contient les événements d'une fabrication. */
export const craftStream = (craftId: string) => `${FORGE_STREAM_PREFIX}${craftId}`

/** Nom du canal temps réel discret de la Forge. */
export const FORGE_CHANNEL = 'forge'

/** Sujets des messages adressés à la Forge. */
export const FORGE_TOPICS = {
  /** Réponse du Village à une réservation de ressources. */
  transferResult: 'forge.transfer-result',
} as const
