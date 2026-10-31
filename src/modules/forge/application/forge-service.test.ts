import { describe, expect, it, vi } from 'vitest'
import { REALM_TOPICS } from '@/modules/realm/contracts'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import type { NewMessage } from '@/platform/outbox/outbox'
import { createProjectionRunner } from '@/platform/projection/projection'
import { FORGE_TOPICS } from '../contracts'
import { RECIPES } from '../domain/recipes'
import { createDrizzleCraftsReader } from '../infrastructure/drizzle-crafts-reader'
import { createEventStoreCraftRepository } from '../infrastructure/event-store-craft-repository'
import { createForgeHandlers } from '../messages'
import { createForgeService } from './forge-service'

const T0 = 1_000_000

describe('Service de la Forge et saga avec le Village', () => {
  it('lance une fabrication et émet la demande de prélèvement vers le Village', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreCraftRepository(store)
    const reader = createDrizzleCraftsReader(db, projections)

    const messages: NewMessage[] = []
    const originalSave = repo.save.bind(repo)
    repo.save = async (craftId, expectedVersion, events, msgs) => {
      if (msgs) messages.push(...msgs)
      return originalSave(craftId, expectedVersion, events, msgs)
    }

    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 })
    const service = createForgeService(repo, reader, {
      dispatch,
      clock: () => T0,
      newId: () => 'craft-123',
    })

    const { craftId, result } = await service.startCraft({ id: 'alice', name: 'Alice' }, 'sword')

    expect(craftId).toBe('craft-123')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.view.status).toBe('reserving')

    expect(dispatch).toHaveBeenCalled()
    expect(messages).toEqual([
      {
        topic: REALM_TOPICS.withdraw,
        payload: {
          transferId: 'forge-craft-123-reserve',
          playerId: 'alice',
          resources: RECIPES.sword.cost,
          replyTo: FORGE_TOPICS.transferResult,
        },
      },
    ])
  })

  it('progresse vers in_progress lors de la confirmation du Village', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreCraftRepository(store)
    const reader = createDrizzleCraftsReader(db, projections)
    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 })

    const service = createForgeService(repo, reader, {
      dispatch,
      clock: () => T0,
      newId: () => 'craft-123',
    })
    const handlers = createForgeHandlers(service)

    await service.startCraft({ id: 'alice', name: 'Alice' }, 'sword')

    // Message de réponse du Village indiquant que le prélèvement a réussi
    await handlers[FORGE_TOPICS.transferResult]({
      id: '1',
      attempt: 1,
      topic: FORGE_TOPICS.transferResult,
      payload: {
        transferId: 'forge-craft-123-reserve',
        outcome: 'withdrawn',
      },
    })

    const view = await service.getCraft('craft-123', 'alice')
    expect(view?.status).toBe('in_progress')
    expect(view?.readyAt).toBe(T0 + RECIPES.sword.durationMs)
  })

  it('compense par un remboursement lors de l’annulation d’une fabrication (étape compensable B5)', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreCraftRepository(store)
    const reader = createDrizzleCraftsReader(db, projections)

    const messages: NewMessage[] = []
    const originalSave = repo.save.bind(repo)
    repo.save = async (craftId, expectedVersion, events, msgs) => {
      if (msgs) messages.push(...msgs)
      return originalSave(craftId, expectedVersion, events, msgs)
    }

    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 })
    const service = createForgeService(repo, reader, {
      dispatch,
      clock: () => T0,
      newId: () => 'craft-cancel',
    })
    const handlers = createForgeHandlers(service)

    await service.startCraft({ id: 'alice', name: 'Alice' }, 'shield')
    await handlers[FORGE_TOPICS.transferResult]({
      id: '2',
      attempt: 1,
      topic: FORGE_TOPICS.transferResult,
      payload: {
        transferId: 'forge-craft-cancel-reserve',
        outcome: 'withdrawn',
      },
    })

    messages.length = 0 // On vide les messages précédents

    // Annulation par le joueur
    const cancelResult = await service.cancelCraft('craft-cancel', 'alice')
    expect(cancelResult.ok).toBe(true)
    if (!cancelResult.ok) return
    expect(cancelResult.view.status).toBe('cancelled')

    // Émission du message de compensation (deposit) pour restituer les ressources
    expect(messages).toEqual([
      {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: 'forge-craft-cancel-refund',
          playerId: 'alice',
          resources: RECIPES.shield.cost,
        },
      },
    ])
  })

  it('permet de réclamer l’objet une fois l’échéance atteinte et l’ajoute à l’inventaire', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreCraftRepository(store)
    const reader = createDrizzleCraftsReader(db, projections)
    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 })

    let currentTime = T0
    const service = createForgeService(repo, reader, {
      dispatch,
      clock: () => currentTime,
      newId: () => 'craft-ready',
    })
    const handlers = createForgeHandlers(service)

    await service.startCraft({ id: 'alice', name: 'Alice' }, 'sword')
    await handlers[FORGE_TOPICS.transferResult]({
      id: '3',
      attempt: 1,
      topic: FORGE_TOPICS.transferResult,
      payload: {
        transferId: 'forge-craft-ready-reserve',
        outcome: 'withdrawn',
      },
    })

    // Tentative avant l'échéance : refusé
    const earlyClaim = await service.claimItem('craft-ready', 'alice')
    expect(earlyClaim.ok).toBe(false)

    // Avancement de l'horloge au-delà de l'échéance de confection
    currentTime = T0 + RECIPES.sword.durationMs + 100
    const claim = await service.claimItem('craft-ready', 'alice')
    expect(claim.ok).toBe(true)
    if (!claim.ok) return
    expect(claim.view.status).toBe('completed')

    // Présent dans l'inventaire du joueur
    const overview = await service.overview('alice')
    expect(overview.inventory).toHaveLength(1)
    expect(overview.inventory[0].recipeId).toBe('sword')
  })
})
