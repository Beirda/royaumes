import { bigint, index, jsonb, pgSchema, text } from 'drizzle-orm/pg-core'

/** Schéma PostgreSQL du module Forge. Ses événements restent dans le journal de la plateforme. */
export const forge = pgSchema('forge')

/**
 * Modèle de lecture des fabrications d'objets : chaque fabrication y entre à son lancement
 * et voit son statut évoluer (reserving, in_progress, completed, cancelled, rejected).
 */
export const crafts = forge.table(
  'crafts',
  {
    craftId: text('craft_id').primaryKey(),
    playerId: text('player_id').notNull(),
    playerName: text('player_name').notNull(),
    recipeId: text('recipe_id').notNull(),
    status: text('status').notNull(),
    cost: jsonb('cost').notNull(),
    startedAt: bigint('started_at', { mode: 'number' }).notNull(),
    readyAt: bigint('ready_at', { mode: 'number' }).notNull(),
    completedAt: bigint('completed_at', { mode: 'number' }),
    raidsUsed: bigint('raids_used', { mode: 'number' }).notNull().default(0),
  },
  (t) => [index('crafts_player_idx').on(t.playerId)],
)
