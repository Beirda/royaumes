import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'
import {
  createEventStore,
  type EventStore,
  type NewEvent,
} from '@/platform/event-store/event-store'
import { createProjectionRunner } from '@/platform/projection/projection'
import type { RankingReader } from '../application/ranking-reader'
import { createDrizzleRankingReader } from './drizzle-ranking-reader'

// Chaque test dispose d'un journal neuf et d'un classement vide.
let store: EventStore
let reader: RankingReader
beforeEach(async () => {
  const db = await createTestDatabase()
  store = createEventStore(db)
  reader = createDrizzleRankingReader(db, createProjectionRunner(db))
})

// Événements du Donjon et du Village, réduits aux champs lus par le classement.
const created = (hostId: string): NewEvent => ({
  type: 'GameCreated',
  data: { hostId, hostName: hostId.toUpperCase() },
})
const joined = (playerId: string): NewEvent => ({
  type: 'PlayerJoined',
  data: { playerId, name: playerId.toUpperCase() },
})
const companion: NewEvent = { type: 'CompanionAdded', data: { companionId: 'companion-1' } }
const ended = (result: 'won' | 'lost', loot: number, heroIds: string[]): NewEvent => ({
  type: 'GameEnded',
  data: { result, loot, heroIds },
})

/** Ligne du classement d'un joueur. */
const entryOf = async (playerId: string) =>
  (await reader.top(20)).entries.find((entry) => entry.playerId === playerId)

describe('Projection du classement', () => {
  it("attribue le résultat d'une expédition gagnée à ses joueurs, sans les compagnons", async () => {
    await store.append('dungeon-g1', 0, [
      created('alice'),
      joined('bob'),
      companion,
      ended('won', 40, ['alice', 'bob', 'companion-1']),
    ])

    const { entries } = await reader.top(20)
    expect(entries.map((entry) => entry.playerId).sort()).toEqual(['alice', 'bob'])
    expect(await entryOf('alice')).toMatchObject({
      label: 'ALICE',
      gamesPlayed: 1,
      gamesWon: 1,
      gold: 13,
      bestLoot: 13,
    })
    expect(await entryOf('bob')).toMatchObject({
      label: 'BOB',
      gamesPlayed: 1,
      gamesWon: 1,
      gold: 13,
      bestLoot: 13,
    })
  })

  it('divise le butin à 50% avec 1 bot, 33% avec 2 bots, 25% avec 3 bots ou 2 joueurs et 2 bots', async () => {
    // 1 joueur + 1 bot : 50% de 40 = 20
    await store.append('dungeon-solo1', 0, [
      created('player1'),
      companion,
      ended('won', 40, ['player1', 'companion-1']),
    ])
    expect(await entryOf('player1')).toMatchObject({ gold: 20, bestLoot: 20 })

    // 1 joueur + 2 bots : 33% (1/3) de 30 = 10
    await store.append('dungeon-solo2', 0, [
      created('player2'),
      companion,
      { type: 'CompanionAdded', data: { companionId: 'companion-2' } },
      ended('won', 30, ['player2', 'companion-1', 'companion-2']),
    ])
    expect(await entryOf('player2')).toMatchObject({ gold: 10, bestLoot: 10 })

    // 1 joueur + 3 bots : 25% de 40 = 10
    await store.append('dungeon-solo3', 0, [
      created('player3'),
      companion,
      { type: 'CompanionAdded', data: { companionId: 'companion-2' } },
      { type: 'CompanionAdded', data: { companionId: 'companion-3' } },
      ended('won', 40, ['player3', 'companion-1', 'companion-2', 'companion-3']),
    ])
    expect(await entryOf('player3')).toMatchObject({ gold: 10, bestLoot: 10 })

    // 2 joueurs + 2 bots : 25% de 100 = 25 chacun
    await store.append('dungeon-multi', 0, [
      created('pA'),
      joined('pB'),
      companion,
      { type: 'CompanionAdded', data: { companionId: 'companion-2' } },
      ended('won', 100, ['pA', 'pB', 'companion-1', 'companion-2']),
    ])
    expect(await entryOf('pA')).toMatchObject({ gold: 25, bestLoot: 25 })
    expect(await entryOf('pB')).toMatchObject({ gold: 25, bestLoot: 25 })
  })

  it('compte une défaite comme une expédition, sans victoire ni or', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('lost', 25, ['alice'])])
    expect(await entryOf('alice')).toMatchObject({ gamesPlayed: 1, gamesWon: 0, gold: 0 })
  })

  it("compte les améliorations du Village, et nomme le joueur d'après son village", async () => {
    await store.append('village-carol', 0, [
      { type: 'VillageFounded', data: { name: 'Valombre' } },
      { type: 'BuildingUpgraded', data: {} },
      { type: 'BuildingUpgraded', data: {} },
    ])
    expect(await entryOf('carol')).toMatchObject({ label: 'Seigneur de Valombre', upgrades: 2 })
  })

  it('retient le meilleur butin des expéditions gagnées', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('won', 25, ['alice'])])
    await store.append('dungeon-g2', 0, [created('alice'), ended('won', 40, ['alice'])])
    await store.append('dungeon-g3', 0, [created('alice'), ended('won', 10, ['alice'])])
    await store.append('dungeon-g4', 0, [created('alice'), ended('lost', 90, ['alice'])])
    expect(await entryOf('alice')).toMatchObject({ gamesWon: 3, gold: 75, bestLoot: 40 })
  })

  it('range les joueurs par victoires, puis par or', async () => {
    await store.append('dungeon-g1', 0, [created('alice'), ended('won', 10, ['alice'])])
    await store.append('dungeon-g2', 0, [created('bob'), ended('won', 30, ['bob'])])
    await store.append('dungeon-g3', 0, [created('carol'), ended('lost', 0, ['carol'])])
    await store.append('dungeon-g4', 0, [created('alice'), ended('won', 5, ['alice'])])

    const { entries } = await reader.top(20)
    expect(entries.map((entry) => [entry.rank, entry.playerId])).toEqual([
      [1, 'alice'],
      [2, 'bob'],
      [3, 'carol'],
    ])
  })
})
