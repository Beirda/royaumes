/**
 * Saga de la Forge : orchestration des transferts de ressources avec le Village.
 * Domaine pur : aucune dépendance technique.
 */

import { type CraftEvent, type CraftState, transferIdOf } from './craft'
import type { Amounts } from './recipes'

export type SagaRequest =
  | { kind: 'withdraw'; transferId: string; playerId: string; resources: Amounts }
  | { kind: 'deposit'; transferId: string; playerId: string; resources: Amounts }

/**
 * Détermine les demandes de transfert déclenchées par un événement du domaine.
 * L'état reçu est celui postérieur à l'application de l'événement.
 */
export function requestsFor(state: CraftState, event: CraftEvent): SagaRequest[] {
  switch (event.type) {
    // 1. Lancement de la fabrication : prélèvement des ressources au Village
    case 'CraftStarted':
      return [
        {
          kind: 'withdraw',
          transferId: transferIdOf(state.craftId, 'reserve'),
          playerId: state.playerId,
          resources: state.cost,
        },
      ]

    // 2. Annulation : étape compensable de remboursement des ressources au Village
    case 'CraftCancelled':
      return [
        {
          kind: 'deposit',
          transferId: transferIdOf(state.craftId, 'refund'),
          playerId: state.playerId,
          resources: state.cost,
        },
      ]

    // Autres événements : aucune demande nécessaire
    case 'CraftInProgress':
    case 'CraftRejected':
    case 'ItemClaimed':
      return []
  }
}
