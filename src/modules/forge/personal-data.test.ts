import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import { ERASED_NAME } from '@/platform/privacy/privacy'
import { craftStream } from './contracts'
import { crafts } from './infrastructure/schema'
import { createForgePersonalData } from './personal-data'

describe('Données personnelles de la Forge (RGPD)', () => {
  it('exporte les fabrications du joueur', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const personalData = createForgePersonalData(store, db)

    await store.append(craftStream('craft-1'), 0, [
      {
        type: 'CraftStarted',
        data: {
          craftId: 'craft-1',
          playerId: 'alice',
          playerName: 'Alice',
          recipeId: 'sword',
          cost: { wood: 20, stone: 10 },
          startedAt: 1000,
          readyAt: 6000,
        },
      },
    ])

    // Une fabrication de Bob
    await store.append(craftStream('craft-2'), 0, [
      {
        type: 'CraftStarted',
        data: {
          craftId: 'craft-2',
          playerId: 'bob',
          playerName: 'Bob',
          recipeId: 'shield',
          cost: { wood: 30, stone: 20 },
          startedAt: 2000,
          readyAt: 12000,
        },
      },
    ])

    const exportAlice = (await personalData.export('alice')) as {
      crafts: { craftId: string; recipeId: string; cost: Record<string, number> }[]
    }
    expect(exportAlice.crafts).toHaveLength(1)
    expect(exportAlice.crafts[0]).toEqual({
      craftId: 'craft-1',
      recipeId: 'sword',
      cost: { wood: 20, stone: 10 },
      startedAt: 1000,
      readyAt: 6000,
    })
  })

  it('anonymise le nom du joueur dans le journal (redact)', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const personalData = createForgePersonalData(store, db)

    const event = {
      position: 1,
      stream: 'forge-craft-1',
      version: 0,
      type: 'CraftStarted',
      occurredAt: new Date(1000),
      data: {
        craftId: 'craft-1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
      },
    }

    // Réécriture pour Alice
    const rewritten = personalData.redact?.(event, 'alice')
    expect(rewritten).toEqual({
      craftId: 'craft-1',
      playerId: 'alice',
      playerName: ERASED_NAME,
      recipeId: 'sword',
    })

    // Pas de modification pour Bob
    expect(personalData.redact?.(event, 'bob')).toBeNull()
  })

  it('anonymise les enregistrements de la table crafts (erase)', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const personalData = createForgePersonalData(store, db)

    await db.insert(crafts).values([
      {
        craftId: 'c1',
        playerId: 'alice',
        playerName: 'Alice',
        recipeId: 'sword',
        status: 'completed',
        cost: { wood: 20 },
        startedAt: 1000,
        readyAt: 6000,
        completedAt: 6000,
      },
      {
        craftId: 'c2',
        playerId: 'bob',
        playerName: 'Bob',
        recipeId: 'shield',
        status: 'in_progress',
        cost: { wood: 30 },
        startedAt: 2000,
        readyAt: 12000,
      },
    ])

    await personalData.erase?.('alice', [])

    const rows = await db.select().from(crafts)
    const aliceRow = rows.find((r) => r.playerId === 'alice')
    const bobRow = rows.find((r) => r.playerId === 'bob')

    expect(aliceRow?.playerName).toBe(ERASED_NAME)
    expect(bobRow?.playerName).toBe('Bob')
  })
})
