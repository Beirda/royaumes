import { eq } from 'drizzle-orm'
import type { StoredEvent } from '@/platform/event-store/event-store'
import type { Projection } from '@/platform/projection/projection'
import { FORGE_STREAM_PREFIX } from '../contracts'
import type { CraftEvent } from '../domain/craft'
import { crafts } from './schema'

/** Identifiant de la fabrication tiré du nom de son flux : « forge-abc » donne « abc ». */
const craftIdOf = (event: StoredEvent) => event.stream.slice(FORGE_STREAM_PREFIX.length)

/** Projection des fabrications, construite à partir des événements de la Forge. */
export const craftsProjection: Projection = {
  name: 'forge-crafts',
  version: 1,
  eventTypes: ['CraftStarted', 'CraftInProgress', 'CraftRejected', 'CraftCancelled', 'ItemClaimed'],

  async apply(stored, tx) {
    const event = { type: stored.type, data: stored.data } as CraftEvent
    const craftId = craftIdOf(stored)
    const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
      tx
        .update(crafts)
        .set({ status, ...extra })
        .where(eq(crafts.craftId, craftId))

    switch (event.type) {
      case 'CraftStarted':
        await tx.insert(crafts).values({
          craftId,
          playerId: event.data.playerId,
          playerName: event.data.playerName,
          recipeId: event.data.recipeId,
          status: 'reserving',
          cost: event.data.cost,
          startedAt: event.data.startedAt,
          readyAt: event.data.readyAt,
          completedAt: null,
        })
        return

      case 'CraftInProgress':
        await setStatus('in_progress', { readyAt: event.data.readyAt })
        return

      case 'CraftRejected':
        await setStatus('rejected')
        return

      case 'CraftCancelled':
        await setStatus('cancelled')
        return

      case 'ItemClaimed':
        await setStatus('completed', { completedAt: event.data.claimedAt })
        return
    }
  },

  async reset(tx) {
    await tx.delete(crafts)
  },
}
