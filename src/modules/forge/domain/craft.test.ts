import { describe, expect, it } from 'vitest'
import { type CraftState, decide, evolve, initialState, transferIdOf } from './craft'
import { RECIPES, type RecipeId } from './recipes'
import { requestsFor } from './saga'
import { toCraftView } from './view'

describe('Forge - Domaine et règles métier', () => {
  const now = 1_000_000

  // -------------------------------------------------------------------------
  // Règle 1 : recette officielle
  // -------------------------------------------------------------------------
  it('Règle 1 : une recette n’est fabricable que si elle appartient au catalogue officiel', () => {
    // Recette inconnue
    const decisionUnknown = decide(
      initialState,
      {
        type: 'StartCraft',
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'unknown_item' as RecipeId,
      },
      now,
    )
    expect(decisionUnknown.ok).toBe(false)
    if (!decisionUnknown.ok) {
      expect(decisionUnknown.error.code).toBe('UNKNOWN_RECIPE')
    }

    // Recette valide (épée)
    const decisionValid = decide(
      initialState,
      {
        type: 'StartCraft',
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
      },
      now,
    )
    expect(decisionValid.ok).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Règle 2 : réservation auprès du Village
  // -------------------------------------------------------------------------
  it('Règle 2 : le lancement d’une fabrication réserve son coût en ressources auprès du Village', () => {
    const decision = decide(
      initialState,
      {
        type: 'StartCraft',
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
      },
      now,
    )
    expect(decision.ok).toBe(true)
    if (!decision.ok) return

    expect(decision.events).toHaveLength(1)
    const event = decision.events[0]
    expect(event.type).toBe('CraftStarted')
    if (event.type !== 'CraftStarted') return

    expect(event.data.cost).toEqual(RECIPES.sword.cost)

    // Vérification de la saga : demande de prélèvement
    const state = evolve(initialState, event)
    expect(state.status).toBe('reserving')
    const requests = requestsFor(state, event)
    expect(requests).toEqual([
      {
        kind: 'withdraw',
        transferId: transferIdOf('craft-1', 'reserve'),
        playerId: 'alice',
        resources: RECIPES.sword.cost,
      },
    ])
  })

  // -------------------------------------------------------------------------
  // Règle 3 : refus pour ressources insuffisantes
  // -------------------------------------------------------------------------
  it('Règle 3 : si le Village refuse le prélèvement pour ressources insuffisantes, la fabrication est rejetée', () => {
    let state = evolve(initialState, {
      type: 'CraftStarted',
      data: {
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
        cost: RECIPES.sword.cost,
        startedAt: now,
        readyAt: now + RECIPES.sword.durationMs,
      },
    })

    const decision = decide(
      state,
      {
        type: 'RecordTransferResult',
        transferId: transferIdOf('craft-1', 'reserve'),
        outcome: 'refused',
        missing: { stone: 5 },
      },
      now + 50,
    )

    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.events).toHaveLength(1)
    const event = decision.events[0]
    expect(event.type).toBe('CraftRejected')
    if (event.type !== 'CraftRejected') return
    expect(event.data.reason).toBe('insufficient_resources')

    state = evolve(state, event)
    expect(state.status).toBe('rejected')

    // Aucune compensation n'est demandée
    expect(requestsFor(state, event)).toEqual([])
  })

  // -------------------------------------------------------------------------
  // Règle 4 : confirmation du prélèvement et durée de fabrication
  // -------------------------------------------------------------------------
  it('Règle 4 : si le Village confirme le prélèvement, la fabrication entre dans l’état in_progress pour la durée de la recette', () => {
    let state = evolve(initialState, {
      type: 'CraftStarted',
      data: {
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
        cost: RECIPES.sword.cost,
        startedAt: now,
        readyAt: now + RECIPES.sword.durationMs,
      },
    })

    const decision = decide(
      state,
      {
        type: 'RecordTransferResult',
        transferId: transferIdOf('craft-1', 'reserve'),
        outcome: 'withdrawn',
      },
      now + 100,
    )

    expect(decision.ok).toBe(true)
    if (!decision.ok) return
    expect(decision.events).toHaveLength(1)
    const event = decision.events[0]
    expect(event.type).toBe('CraftInProgress')
    if (event.type !== 'CraftInProgress') return

    state = evolve(state, event)
    expect(state.status).toBe('in_progress')
    expect(state.readyAt).toBe(now + 100 + RECIPES.sword.durationMs)
  })

  // -------------------------------------------------------------------------
  // Règle 5 : annulation et remboursement intégral (étape compensable)
  // -------------------------------------------------------------------------
  it('Règle 5 : tant qu’une fabrication est en cours ou en réservation, l’annulation déclenche le remboursement intégral', () => {
    // 1. Annulation pendant l'état in_progress
    const inProgressState: CraftState = {
      exists: true,
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: 'Alice',
      recipeId: 'shield',
      status: 'in_progress',
      cost: RECIPES.shield.cost,
      startedAt: now,
      readyAt: now + RECIPES.shield.durationMs,
      completedAt: null,
    }

    const cancelDecision = decide(
      inProgressState,
      { type: 'CancelCraft', playerId: 'alice' },
      now + 200,
    )
    expect(cancelDecision.ok).toBe(true)
    if (!cancelDecision.ok) return
    const cancelEvent = cancelDecision.events[0]
    expect(cancelEvent.type).toBe('CraftCancelled')

    const cancelledState = evolve(inProgressState, cancelEvent)
    expect(cancelledState.status).toBe('cancelled')

    // Étape compensable de la saga : restitution (deposit) des ressources au Village
    const requests = requestsFor(cancelledState, cancelEvent)
    expect(requests).toEqual([
      {
        kind: 'deposit',
        transferId: transferIdOf('craft-1', 'refund'),
        playerId: 'alice',
        resources: RECIPES.shield.cost,
      },
    ])
  })

  // -------------------------------------------------------------------------
  // Règle 6 : récupération après l'échéance
  // -------------------------------------------------------------------------
  it('Règle 6 : une fabrication ne peut être récupérée que si l’échéance est atteinte', () => {
    const readyAt = now + RECIPES.sword.durationMs
    const inProgressState: CraftState = {
      exists: true,
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: 'Alice',
      recipeId: 'sword',
      status: 'in_progress',
      cost: RECIPES.sword.cost,
      startedAt: now,
      readyAt,
      completedAt: null,
    }

    // Avant l'échéance
    const tooEarly = decide(
      inProgressState,
      { type: 'ClaimItem', playerId: 'alice' },
      readyAt - 100,
    )
    expect(tooEarly.ok).toBe(false)
    if (!tooEarly.ok) {
      expect(tooEarly.error.code).toBe('NOT_READY')
    }

    // À l'échéance exacte ou après
    const onTime = decide(inProgressState, { type: 'ClaimItem', playerId: 'alice' }, readyAt)
    expect(onTime.ok).toBe(true)
    if (!onTime.ok) return
    expect(onTime.events).toHaveLength(1)
    const claimEvent = onTime.events[0]
    expect(claimEvent.type).toBe('ItemClaimed')

    const completedState = evolve(inProgressState, claimEvent)
    expect(completedState.status).toBe('completed')
    expect(completedState.completedAt).toBe(readyAt)
  })

  // -------------------------------------------------------------------------
  // Règle 7 : impossible d'annuler ou réclamer une fabrication terminée/annulée/rejetée
  // -------------------------------------------------------------------------
  it('Règle 7 : une fabrication terminée, rejetée ou annulée ne peut plus être ni annulée ni récupérée', () => {
    const baseState: CraftState = {
      exists: true,
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: 'Alice',
      recipeId: 'sword',
      status: 'completed',
      cost: RECIPES.sword.cost,
      startedAt: now,
      readyAt: now + 5000,
      completedAt: now + 5000,
    }

    // Sur une fabrication complétée
    expect(decide(baseState, { type: 'CancelCraft', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_COMPLETED' },
    })
    expect(decide(baseState, { type: 'ClaimItem', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_CLAIMED' },
    })

    // Sur une fabrication annulée
    const cancelledState = { ...baseState, status: 'cancelled' as const }
    expect(decide(cancelledState, { type: 'CancelCraft', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_CANCELLED' },
    })
    expect(decide(cancelledState, { type: 'ClaimItem', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_CANCELLED' },
    })

    // Sur une fabrication rejetée
    const rejectedState = { ...baseState, status: 'rejected' as const }
    expect(decide(rejectedState, { type: 'CancelCraft', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_REJECTED' },
    })
    expect(decide(rejectedState, { type: 'ClaimItem', playerId: 'alice' }, now + 6000)).toEqual({
      ok: false,
      error: { code: 'ALREADY_REJECTED' },
    })
  })

  // -------------------------------------------------------------------------
  // Règle 8 : seul le propriétaire peut agir
  // -------------------------------------------------------------------------
  it('Règle 8 : un joueur ne peut annuler, réclamer ou consulter que ses propres fabrications', () => {
    const state: CraftState = {
      exists: true,
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: 'Alice',
      recipeId: 'armor',
      status: 'in_progress',
      cost: RECIPES.armor.cost,
      startedAt: now,
      readyAt: now + 15000,
      completedAt: null,
    }

    // Bob tente d'annuler la fabrication d'Alice
    const bobCancel = decide(state, { type: 'CancelCraft', playerId: 'bob' }, now + 100)
    expect(bobCancel).toEqual({ ok: false, error: { code: 'NOT_OWNER' } })

    // Bob tente de réclamer l'objet d'Alice
    const bobClaim = decide(state, { type: 'ClaimItem', playerId: 'bob' }, now + 20000)
    expect(bobClaim).toEqual({ ok: false, error: { code: 'NOT_OWNER' } })

    // Bob tente de consulter la vue
    expect(toCraftView(state, 'bob', now + 100)).toBeNull()
    // Alice consulte sa propre vue
    expect(toCraftView(state, 'alice', now + 100)).not.toBeNull()
  })

  // -------------------------------------------------------------------------
  // Règle 9 : idempotence des messages du Village
  // -------------------------------------------------------------------------
  it('Règle 9 : les réponses du Village sont idempotentes et répétées sans effet', () => {
    const inProgressState: CraftState = {
      exists: true,
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: 'Alice',
      recipeId: 'sword',
      status: 'in_progress',
      cost: RECIPES.sword.cost,
      startedAt: now,
      readyAt: now + 5000,
      completedAt: null,
    }

    // Répétition d'une réponse de prélèvement alors que l'état est déjà in_progress
    const duplicate = decide(
      inProgressState,
      {
        type: 'RecordTransferResult',
        transferId: transferIdOf('craft-1', 'reserve'),
        outcome: 'withdrawn',
      },
      now + 200,
    )
    expect(duplicate).toEqual({ ok: true, events: [] })
  })
})
