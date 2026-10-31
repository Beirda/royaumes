import type { EventStore, NewEvent } from '@/platform/event-store/event-store'
import type { CraftRepository } from '../application/craft-repository'
import { craftStream } from '../contracts'
import { type CraftEvent, replay } from '../domain/craft'

/** Adaptateur du port CraftRepository fondé sur le journal d'événements. */
export function createEventStoreCraftRepository(store: EventStore): CraftRepository {
  return {
    async load(craftId) {
      const stored = await store.read(craftStream(craftId))
      const events = stored.map((e) => ({ type: e.type, data: e.data }) as CraftEvent)
      return { state: replay(events), version: stored.at(-1)?.version ?? 0 }
    },

    async save(craftId, expectedVersion, events, messages) {
      // Les événements de la fabrication et les messages de la saga : une seule transaction.
      await store.append(
        craftStream(craftId),
        expectedVersion,
        events as unknown as NewEvent[],
        messages,
      )
    },
  }
}
