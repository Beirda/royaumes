/**
 * Domaine de la Forge : gestion d'une fabrication d'objet selon le modèle Decider.
 * Domaine pur : aucune dépendance technique.
 */

import { type Amounts, isRecipeId, RECIPES, type RecipeId } from './recipes'

export type CraftStatus = 'reserving' | 'in_progress' | 'completed' | 'cancelled' | 'rejected'

export interface CraftState {
  exists: boolean
  craftId: string
  playerId: string
  playerName: string
  recipeId: RecipeId | null
  status: CraftStatus
  cost: Amounts
  startedAt: number
  readyAt: number
  completedAt: number | null
}

export const initialState: CraftState = {
  exists: false,
  craftId: '',
  playerId: '',
  playerName: '',
  recipeId: null,
  status: 'reserving',
  cost: {},
  startedAt: 0,
  readyAt: 0,
  completedAt: null,
}

// ---------------------------------------------------------------------------
// Événements
// ---------------------------------------------------------------------------

export type CraftEvent =
  | {
      type: 'CraftStarted'
      data: {
        craftId: string
        playerId: string
        playerName: string
        recipeId: RecipeId
        cost: Amounts
        startedAt: number
        readyAt: number
      }
    }
  | {
      type: 'CraftInProgress'
      data: {
        startedAt: number
        readyAt: number
      }
    }
  | {
      type: 'CraftRejected'
      data: {
        reason: string
        missing?: Amounts
        at: number
      }
    }
  | {
      type: 'CraftCancelled'
      data: {
        cancelledAt: number
      }
    }
  | {
      type: 'ItemClaimed'
      data: {
        claimedAt: number
      }
    }

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

export type CraftCommand =
  | {
      type: 'StartCraft'
      craftId: string
      playerId: string
      playerName: string
      recipeId: RecipeId
    }
  | {
      type: 'RecordTransferResult'
      transferId: string
      outcome: 'withdrawn' | 'refused' | 'deposited'
      missing?: Amounts
    }
  | {
      type: 'CancelCraft'
      playerId: string
    }
  | {
      type: 'ClaimItem'
      playerId: string
    }

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

export type CraftError =
  | { code: 'CRAFT_NOT_FOUND' }
  | { code: 'ALREADY_EXISTS' }
  | { code: 'UNKNOWN_RECIPE' }
  | { code: 'NOT_OWNER' }
  | { code: 'CANNOT_CANCEL' }
  | { code: 'ALREADY_CANCELLED' }
  | { code: 'ALREADY_COMPLETED' }
  | { code: 'ALREADY_REJECTED' }
  | { code: 'NOT_READY' }
  | { code: 'ALREADY_CLAIMED' }

export type Decision = { ok: true; events: CraftEvent[] } | { ok: false; error: CraftError }

// ---------------------------------------------------------------------------
// Identifiants de transfert de la saga
// ---------------------------------------------------------------------------

export const FORGE_TRANSFER_PREFIX = 'forge-'

export const transferIdOf = (craftId: string, step: string) =>
  `${FORGE_TRANSFER_PREFIX}${craftId}-${step}`

export function craftIdOf(transferId: string): string {
  if (!transferId.startsWith(FORGE_TRANSFER_PREFIX)) return ''
  const withoutPrefix = transferId.slice(FORGE_TRANSFER_PREFIX.length)
  const lastDash = withoutPrefix.lastIndexOf('-')
  return lastDash === -1 ? withoutPrefix : withoutPrefix.slice(0, lastDash)
}

// ---------------------------------------------------------------------------
// Logique de décision (Decider)
// ---------------------------------------------------------------------------

export function decide(state: CraftState, command: CraftCommand, now: number): Decision {
  switch (command.type) {
    case 'StartCraft': {
      if (state.exists) return { ok: false, error: { code: 'ALREADY_EXISTS' } }
      if (!isRecipeId(command.recipeId)) {
        return { ok: false, error: { code: 'UNKNOWN_RECIPE' } }
      }
      const recipe = RECIPES[command.recipeId]

      // DETTE TECHNIQUE (DT-012) : Aucun plafond n'est imposé sur le nombre de fabrications simultanées par joueur.
      return {
        ok: true,
        events: [
          {
            type: 'CraftStarted',
            data: {
              craftId: command.craftId,
              playerId: command.playerId,
              playerName: command.playerName,
              recipeId: command.recipeId,
              cost: recipe.cost,
              startedAt: now,
              readyAt: now + recipe.durationMs,
            },
          },
        ],
      }
    }

    case 'RecordTransferResult': {
      if (!state.exists) return { ok: false, error: { code: 'CRAFT_NOT_FOUND' } }

      // Règle 9 : idempotence. Si l'état n'est plus "reserving", la réponse est ignorée sans erreur.
      if (state.status !== 'reserving') {
        return { ok: true, events: [] }
      }

      if (command.outcome === 'refused') {
        return {
          ok: true,
          events: [
            {
              type: 'CraftRejected',
              data: {
                reason: 'insufficient_resources',
                missing: command.missing,
                at: now,
              },
            },
          ],
        }
      }

      if (command.outcome === 'withdrawn') {
        return {
          ok: true,
          events: [
            {
              type: 'CraftInProgress',
              data: {
                startedAt: now,
                readyAt: now + (state.recipeId ? RECIPES[state.recipeId].durationMs : 0),
              },
            },
          ],
        }
      }

      // Si le Village confirme un versement (remboursement), aucun événement n'est requis
      return { ok: true, events: [] }
    }

    case 'CancelCraft': {
      if (!state.exists) return { ok: false, error: { code: 'CRAFT_NOT_FOUND' } }
      if (state.playerId !== command.playerId) {
        return { ok: false, error: { code: 'NOT_OWNER' } }
      }

      if (state.status === 'completed') {
        return { ok: false, error: { code: 'ALREADY_COMPLETED' } }
      }
      if (state.status === 'cancelled') {
        return { ok: false, error: { code: 'ALREADY_CANCELLED' } }
      }
      if (state.status === 'rejected') {
        return { ok: false, error: { code: 'ALREADY_REJECTED' } }
      }
      if (state.status !== 'reserving' && state.status !== 'in_progress') {
        return { ok: false, error: { code: 'CANNOT_CANCEL' } }
      }

      return {
        ok: true,
        events: [
          {
            type: 'CraftCancelled',
            data: { cancelledAt: now },
          },
        ],
      }
    }

    case 'ClaimItem': {
      if (!state.exists) return { ok: false, error: { code: 'CRAFT_NOT_FOUND' } }
      if (state.playerId !== command.playerId) {
        return { ok: false, error: { code: 'NOT_OWNER' } }
      }

      if (state.status === 'completed') {
        return { ok: false, error: { code: 'ALREADY_CLAIMED' } }
      }
      if (state.status === 'cancelled') {
        return { ok: false, error: { code: 'ALREADY_CANCELLED' } }
      }
      if (state.status === 'rejected') {
        return { ok: false, error: { code: 'ALREADY_REJECTED' } }
      }
      if (state.status !== 'in_progress') {
        return { ok: false, error: { code: 'NOT_READY' } }
      }

      // DETTE TECHNIQUE (DT-011) : L'échéance de confection est vérifiée de manière paresseuse (clock() >= readyAt).
      if (now < state.readyAt) {
        return { ok: false, error: { code: 'NOT_READY' } }
      }

      return {
        ok: true,
        events: [
          {
            type: 'ItemClaimed',
            data: { claimedAt: now },
          },
        ],
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Transition d'état (Evolve)
// ---------------------------------------------------------------------------

export function evolve(state: CraftState, event: CraftEvent): CraftState {
  switch (event.type) {
    case 'CraftStarted':
      return {
        ...state,
        exists: true,
        craftId: event.data.craftId,
        playerId: event.data.playerId,
        playerName: event.data.playerName,
        recipeId: event.data.recipeId,
        status: 'reserving',
        cost: event.data.cost,
        startedAt: event.data.startedAt,
        readyAt: event.data.readyAt,
        completedAt: null,
      }

    case 'CraftInProgress':
      return {
        ...state,
        status: 'in_progress',
        startedAt: event.data.startedAt,
        readyAt: event.data.readyAt,
      }

    case 'CraftRejected':
      return {
        ...state,
        status: 'rejected',
      }

    case 'CraftCancelled':
      return {
        ...state,
        status: 'cancelled',
      }

    case 'ItemClaimed':
      return {
        ...state,
        status: 'completed',
        completedAt: event.data.claimedAt,
      }
  }
}

/** Reconstitue l'état d'une fabrication à partir de son historique d'événements. */
export const replay = (events: CraftEvent[]): CraftState => events.reduce(evolve, initialState)
