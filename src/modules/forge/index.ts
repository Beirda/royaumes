/**
 * Entrée publique « serveur » du module Forge.
 * Avec contracts.ts et ui.tsx, c'est le seul fichier du module qui peut être
 * importé depuis l'extérieur.
 */

import type { Db } from '@/platform/db/client'
import type { EventStore } from '@/platform/event-store/event-store'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { ChannelPolicy } from '@/platform/realtime/channel-policy'
import { createForgeApi } from './api'
import { createForgeService } from './application/forge-service'
import { FORGE_CHANNEL } from './contracts'
import { craftsProjection } from './infrastructure/crafts-projection'
import { createDrizzleCraftsReader } from './infrastructure/drizzle-crafts-reader'
import { createEventStoreCraftRepository } from './infrastructure/event-store-craft-repository'
import { createForgeHandlers } from './messages'
import { createForgePersonalData } from './personal-data'

export interface ForgeModuleDeps {
  /** Journal d'événements de la plateforme. */
  store: EventStore
  /** Base de données pour le modèle de lecture. */
  db: Db
  /** Moteur des projections. */
  projections: ProjectionRunner
  /** Distribution de la boîte d'envoi. */
  dispatch: () => Promise<unknown>
  /** Horloge de référence. */
  clock?: () => number
}

/**
 * Fabrique du module Forge : assemble les adaptateurs, le service, l'API, la politique
 * de canal temps réel, les gestionnaires de messages et le contributeur de données personnelles.
 */
export function createForgeModule({ store, db, projections, dispatch, clock }: ForgeModuleDeps) {
  const repo = createEventStoreCraftRepository(store)
  const reader = createDrizzleCraftsReader(db, projections)
  const service = createForgeService(repo, reader, { dispatch, clock })

  // Canal global et discret, annonçant les évolutions pour rechargement côté client
  const channelPolicy: ChannelPolicy = {
    prefix: FORGE_CHANNEL,
    canSubscribe: (channel) => channel === FORGE_CHANNEL,
    redact: true,
    global: { types: craftsProjection.eventTypes },
  }

  return {
    api: createForgeApi(service),
    channelPolicy,
    handlers: createForgeHandlers(service),
    personalData: createForgePersonalData(store, db),
    getHeroSpec: (playerId: string) => service.getHeroSpec(playerId),
    consumeRaid: (playerId: string) => service.recordRaidUsage(playerId),
    getProductionBonus: (playerId: string) => service.getProductionBonus(playerId),
    service,
  }
}

export type { ForgeApi } from './api'
