import type { NewMessage } from '@/platform/outbox/outbox'
import type { GameEvent, GameState } from '../domain/game'

/**
 * Port de persistance du Donjon, défini par la couche application.
 * Comme celui du Village, il est exprimé dans les termes du domaine.
 */
export interface GameRepository {
  /** Charge l'état d'une expédition, reconstruit à partir de ses événements, et sa version. */
  load(gameId: string): Promise<{ state: GameState; version: number }>

  /**
   * Enregistre de nouveaux événements à la suite des précédents, accompagnés le cas échéant
   * de messages pour la boîte d'envoi (versement du butin au Village).
   * Une ConcurrencyError est levée si d'autres événements ont été enregistrés depuis la lecture.
   */
  save(
    gameId: string,
    expectedVersion: number,
    events: GameEvent[],
    messages?: NewMessage[],
  ): Promise<void>

  /** Indique si un joueur a déjà fondé un village. */
  hasVillage?(playerId: string): Promise<boolean>
}
