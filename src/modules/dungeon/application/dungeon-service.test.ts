import { describe, expect, it, vi } from 'vitest'
import { REALM_TOPICS } from '@/modules/realm/contracts'
import { createTestDatabase } from '@/platform/db/client'
import { createEventStore } from '@/platform/event-store/event-store'
import type { NewMessage } from '@/platform/outbox/outbox'
import { createProjectionRunner } from '@/platform/projection/projection'
import { createDrizzleOpenGamesReader } from '../infrastructure/drizzle-open-games-reader'
import { createEventStoreGameRepository } from '../infrastructure/event-store-game-repository'
import { createDungeonService } from './dungeon-service'

describe('Service du Donjon - récupération des récompenses', () => {
  it('verse la part de butin au village des joueurs lorsque l’expédition est gagnée', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreGameRepository(store)
    const openGames = createDrizzleOpenGamesReader(db, projections)
    const dispatch = vi.fn().mockResolvedValue({ delivered: 1, failed: 0 })

    const service = createDungeonService(repo, openGames, {
      dispatch,
      newId: () => 'game-1',
      newSeed: () => 123,
      // Horloge gelée avant l'échéance de 1000ms : évite la résolution automatique du combat.
      clock: () => 500,
    })

    // Alice a fondé un village
    await store.append('village-alice', 0, [{ type: 'VillageFounded', data: { name: 'Valombre' } }])

    // Alice ouvre une expédition et engage un mercenaire (bot)
    await service.create({ id: 'alice', name: 'Alice' })
    await service.execute('game-1', 'alice', { type: 'AddCompanion', playerId: 'alice' })

    // On prépare une fin d'expédition gagnée avec 40 or
    // Simulation d'une victoire avec 40 or : 2 participants (Alice + 1 mercenaire bot) -> 50% = 20 or
    // Le donjon a 6 salles ; la dernière (indice 5) abrite le troll pour déclencher GameEnded.
    const messages: NewMessage[] = []
    const originalSave = repo.save.bind(repo)
    repo.save = async (gameId, expectedVersion, events, msgs) => {
      if (msgs) messages.push(...msgs)
      return originalSave(gameId, expectedVersion, events, msgs)
    }

    const { version } = await repo.load('game-1')
    await repo.save('game-1', version, [
      {
        type: 'GameStarted',
        data: {
          rooms: [
            { kind: 'treasure', gold: 40 },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'monsters', monsters: [{ kind: 'troll', hp: 1, attack: 1 }] },
          ],
          at: 0,
        },
      },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 0, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 1, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 2, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 3, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 4, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'alice', room: 5, deadline: 1000, at: 0 } },
    ])

    // Alice attaque et achève le troll
    const attackResult = await service.execute('game-1', 'alice', {
      type: 'SubmitAction',
      playerId: 'alice',
      round: 1,
      action: { type: 'attack', target: 'm0' },
    })

    expect(attackResult.ok).toBe(true)
    if (attackResult.ok) {
      expect(attackResult.view.phase).toBe('won')
      expect(attackResult.view.loot).toBe(40)
      // 50% pour Alice avec 1 mercenaire bot
      expect(attackResult.view.share).toBe(20)
    }

    // Le message de versement a été émis pour Alice (20 or) et dispatch a été appelé
    expect(dispatch).toHaveBeenCalled()
    expect(messages).toEqual([
      {
        topic: REALM_TOPICS.deposit,
        payload: {
          transferId: 'dungeon-game-1-alice',
          playerId: 'alice',
          resources: { gold: 20 },
        },
      },
    ])
  })

  it('ne verse aucun butin si le joueur n’a pas encore fondé de village', async () => {
    const db = await createTestDatabase()
    const store = createEventStore(db)
    const projections = createProjectionRunner(db)
    const repo = createEventStoreGameRepository(store)
    const openGames = createDrizzleOpenGamesReader(db, projections)
    const dispatch = vi.fn().mockResolvedValue({ delivered: 0, failed: 0 })

    const service = createDungeonService(repo, openGames, {
      dispatch,
      newId: () => 'game-2',
      newSeed: () => 123,
      // Horloge gelée avant l'échéance de 1000ms : évite la résolution automatique du combat.
      clock: () => 500,
    })

    // Bob n'a PAS de village
    await service.create({ id: 'bob', name: 'Bob' })
    const { version } = await repo.load('game-2')
    await repo.save('game-2', version, [
      {
        type: 'GameStarted',
        data: {
          rooms: [
            { kind: 'treasure', gold: 30 },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'empty' },
            { kind: 'monsters', monsters: [{ kind: 'troll', hp: 1, attack: 1 }] },
          ],
          at: 0,
        },
      },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 0, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 1, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 2, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 3, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 4, deadline: null, at: 0 } },
      { type: 'RoomEntered', data: { heroId: 'bob', room: 5, deadline: 1000, at: 0 } },
    ])

    const res = await service.execute('game-2', 'bob', {
      type: 'SubmitAction',
      playerId: 'bob',
      round: 1,
      action: { type: 'attack', target: 'm0' },
    })

    expect(res.ok).toBe(true)
    // Aucun message n'a été créé car Bob n'a pas de village
    expect(dispatch).not.toHaveBeenCalled()
  })
})
