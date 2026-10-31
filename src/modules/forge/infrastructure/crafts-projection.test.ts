import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { CraftsReader } from '../application/crafts-reader'
import { craftStream } from '../contracts'
import { RECIPES } from '../domain/recipes'
import { craftsProjection } from './crafts-projection'
import { createDrizzleCraftsReader } from './drizzle-crafts-reader'

const T0 = 1_000_000

describe('Projection des fabrications de la Forge', () => {
  let store: EventStore
  let reader: CraftsReader

  beforeEach(async () => {
    const db = await createTestDatabase()
    store = createEventStore(db)
    reader = createDrizzleCraftsReader(db, createProjectionRunner(db))
  })

  it('possède un nom et une version bien définis pour la reprise', () => {
    expect(craftsProjection.name).toBe('forge-crafts')
    expect(craftsProjection.version).toBe(1)
  })

  it('met à jour l’état de l’atelier et l’inventaire au fil des événements', async () => {
    const startEvent: NewEvent = {
      type: 'CraftStarted',
      data: {
        craftId: 'c1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
        cost: RECIPES.sword.cost,
        startedAt: T0,
        readyAt: T0 + RECIPES.sword.durationMs,
      },
    }

    await store.append(craftStream('c1'), 0, [startEvent])

    // À ce stade, la fabrication est en cours de réservation
    let overview = await reader.overview('alice', T0)
    expect(overview.crafts).toHaveLength(1)
    expect(overview.crafts[0].status).toBe('reserving')
    expect(overview.inventory).toHaveLength(0)

    // Confirmation du prélèvement : passage à in_progress
    const inProgressEvent: NewEvent = {
      type: 'CraftInProgress',
      data: {
        startedAt: T0,
        readyAt: T0 + RECIPES.sword.durationMs,
      },
    }
    await store.append(craftStream('c1'), 1, [inProgressEvent])

    overview = await reader.overview('alice', T0 + 100)
    expect(overview.crafts[0].status).toBe('in_progress')
    expect(overview.crafts[0].isReady).toBe(false)

    // Une fois la durée écoulée, isReady passe à true
    overview = await reader.overview('alice', T0 + RECIPES.sword.durationMs + 10)
    expect(overview.crafts[0].isReady).toBe(true)

    // Récupération de l'objet : passage dans l'inventaire
    const claimedEvent: NewEvent = {
      type: 'ItemClaimed',
      data: { claimedAt: T0 + RECIPES.sword.durationMs + 10 },
    }
    await store.append(craftStream('c1'), 2, [claimedEvent])

    overview = await reader.overview('alice', T0 + RECIPES.sword.durationMs + 20)
    expect(overview.crafts).toHaveLength(0)
    expect(overview.inventory).toHaveLength(1)
    expect(overview.inventory[0].recipeId).toBe('sword')
    expect(overview.inventory[0].status).toBe('completed')
  })

  it('retire des confections actives les fabrications annulées ou rejetées', async () => {
    // Une fabrication rejetée
    await store.append(craftStream('c-rejected'), 0, [
      {
        type: 'CraftStarted',
        data: {
          craftId: 'c-rejected',
          playerId: 'alice',
          playerName: 'Alice',
          recipeId: 'armor',
          cost: RECIPES.armor.cost,
          startedAt: T0,
          readyAt: T0 + RECIPES.armor.durationMs,
        },
      },
      {
        type: 'CraftRejected',
        data: { reason: 'insufficient_resources', at: T0 + 10 },
      },
    ])

    // Une fabrication annulée
    await store.append(craftStream('c-cancelled'), 0, [
      {
        type: 'CraftStarted',
        data: {
          craftId: 'c-cancelled',
          playerId: 'alice',
          playerName: 'Alice',
          recipeId: 'shield',
          cost: RECIPES.shield.cost,
          startedAt: T0,
          readyAt: T0 + RECIPES.shield.durationMs,
        },
      },
      {
        type: 'CraftCancelled',
        data: { cancelledAt: T0 + 20 },
      },
    ])

    const overview = await reader.overview('alice', T0 + 100)
    expect(overview.crafts).toHaveLength(0)
    expect(overview.inventory).toHaveLength(0)
  })
})
