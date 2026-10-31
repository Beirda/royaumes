/**
 * Modèle de vue d'une fabrication pour l'interface utilisateur.
 * Domaine pur : aucune dépendance technique.
 */

import type { CraftState, CraftStatus } from './craft'
import type { Amounts, RecipeId } from './recipes'

export interface CraftView {
  craftId: string
  recipeId: RecipeId
  status: CraftStatus
  isReady: boolean
  cost: Amounts
  startedAt: number
  readyAt: number
  remainingMs: number
  completedAt: number | null
}

export function toCraftView(state: CraftState, viewerId: string, now: number): CraftView | null {
  if (!state.exists || state.playerId !== viewerId || !state.recipeId) {
    return null
  }

  const isReady = state.status === 'in_progress' && now >= state.readyAt
  const remainingMs =
    state.status === 'in_progress' || state.status === 'reserving'
      ? Math.max(0, state.readyAt - now)
      : 0

  return {
    craftId: state.craftId,
    recipeId: state.recipeId,
    status: state.status,
    isReady,
    cost: state.cost,
    startedAt: state.startedAt,
    readyAt: state.readyAt,
    remainingMs,
    completedAt: state.completedAt,
  }
}
