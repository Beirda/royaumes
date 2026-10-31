import { eq } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import { ERASED_NAME, type PersonalDataContributor } from '@/platform/privacy/privacy'
import { FORGE_STREAM_PREFIX } from './contracts'
import { crafts } from './infrastructure/schema'

interface CraftStartedData {
  craftId: string
  playerId: string
  playerName: string
  recipeId: string
  cost: Record<string, number>
  startedAt: number
  readyAt: number
}

/**
 * Données personnelles de la Forge : le nom du joueur dans ses fabrications.
 */
export function createForgePersonalData(store: EventStore, db: Db): PersonalDataContributor {
  return {
    name: 'forge',

    async export(playerId) {
      const stored = await store.readAll({
        streamPrefix: FORGE_STREAM_PREFIX,
        types: ['CraftStarted'],
      })
      const craftId = (stream: string) => stream.slice(FORGE_STREAM_PREFIX.length)
      return {
        crafts: stored
          .filter((e) => {
            if (e.type !== 'CraftStarted') return false
            const data = e.data as unknown as CraftStartedData
            return data.playerId === playerId
          })
          .map((e) => {
            const data = e.data as unknown as CraftStartedData
            return {
              craftId: craftId(e.stream),
              recipeId: data.recipeId,
              cost: data.cost,
              startedAt: data.startedAt,
              readyAt: data.readyAt,
            }
          }),
      }
    },

    redact(event, playerId) {
      if (!event.stream.startsWith(FORGE_STREAM_PREFIX)) return null
      if (event.type === 'CraftStarted') {
        const data = event.data as unknown as CraftStartedData
        if (data.playerId === playerId) {
          return data.playerName === ERASED_NAME ? null : { ...event.data, playerName: ERASED_NAME }
        }
      }
      return null
    },

    async erase(playerId) {
      await db.update(crafts).set({ playerName: ERASED_NAME }).where(eq(crafts.playerId, playerId))
    },
  }
}
