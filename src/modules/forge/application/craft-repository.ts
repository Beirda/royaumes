import type { NewMessage } from '@/platform/outbox/outbox'
import type { CraftEvent, CraftState } from '../domain/craft'

/** Port de persistance des fabrications, défini par la couche application. */
export interface CraftRepository {
  /** Charge l'état d'une fabrication, reconstruit à partir de ses événements, et sa version. */
  load(craftId: string): Promise<{ state: CraftState; version: number }>

  /**
   * Enregistre de nouveaux événements, et les messages de la saga qu'ils déclenchent,
   * dans une même transaction.
   */
  save(
    craftId: string,
    expectedVersion: number,
    events: CraftEvent[],
    messages: NewMessage[],
  ): Promise<void>
}
