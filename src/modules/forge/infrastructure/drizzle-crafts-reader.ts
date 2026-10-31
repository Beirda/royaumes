import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Db } from '@/platform/db/client'
import type { ProjectionRunner } from '@/platform/projection/projection'
import type { CraftsReader } from '../application/crafts-reader'
import {
  type Amounts,
  calculatePlayerStats,
  type ForgeCraftSummary,
  type ForgeOverview,
  MAX_EQUIPMENT_RAIDS,
  RECIPES,
  type RecipeId,
  TOOL_DURATION_MS,
} from '../contracts'
import { craftsProjection } from './crafts-projection'
import { crafts } from './schema'

export function createDrizzleCraftsReader(db: Db, projections: ProjectionRunner): CraftsReader {
  return {
    async overview(playerId, now): Promise<ForgeOverview> {
      await projections.catchUp(craftsProjection)

      const rows = await db
        .select()
        .from(crafts)
        .where(eq(crafts.playerId, playerId))
        .orderBy(desc(crafts.startedAt))

      const activeCrafts: ForgeCraftSummary[] = []
      const inventory: ForgeCraftSummary[] = []

      for (const row of rows) {
        const recipeId = row.recipeId as RecipeId
        const recipe = RECIPES[recipeId]
        const recipeName = recipe?.name ?? row.recipeId
        const isReady = row.status === 'in_progress' && now >= row.readyAt
        const remainingMs =
          row.status === 'in_progress' || row.status === 'reserving'
            ? Math.max(0, row.readyAt - now)
            : 0

        const raidsUsed = row.raidsUsed ?? 0
        const hasCombat = !!(recipe?.effect.attack || recipe?.effect.defense || recipe?.effect.hp)
        const hasProduction = !!recipe?.effect.production

        const raidsRemaining = hasCombat ? Math.max(0, MAX_EQUIPMENT_RAIDS - raidsUsed) : 0
        const expiresAt =
          row.completedAt && hasProduction ? row.completedAt + TOOL_DURATION_MS : null

        const combatExpired = hasCombat ? raidsRemaining === 0 : true
        const toolExpired = hasProduction ? (expiresAt !== null ? now > expiresAt : false) : true
        const isExpired = combatExpired && toolExpired

        const summary: ForgeCraftSummary = {
          craftId: row.craftId,
          recipeId,
          recipeName,
          status: row.status as ForgeCraftSummary['status'],
          isReady,
          cost: row.cost as Amounts,
          startedAt: row.startedAt,
          readyAt: row.readyAt,
          remainingMs,
          completedAt: row.completedAt,
          raidsUsed,
          raidsRemaining,
          isExpired,
          expiresAt,
        }

        if (row.status === 'completed') {
          inventory.push(summary)
        } else if (row.status === 'reserving' || row.status === 'in_progress') {
          activeCrafts.push(summary)
        }
      }

      const stats = calculatePlayerStats(
        inventory.map((item) => ({
          recipeId: item.recipeId,
          raidsUsed: item.raidsUsed,
          completedAt: item.completedAt,
        })),
        now,
      )

      return {
        recipes: Object.values(RECIPES),
        crafts: activeCrafts,
        inventory,
        stats,
      }
    },

    async recordRaidUsage(playerId: string): Promise<void> {
      await projections.catchUp(craftsProjection)
      const combatRecipeIds = (Object.values(RECIPES) as (typeof RECIPES)[RecipeId][])
        .filter((r) => r.effect.attack || r.effect.defense || r.effect.hp)
        .map((r) => r.id)

      await db
        .update(crafts)
        .set({ raidsUsed: sql`${crafts.raidsUsed} + 1` })
        .where(
          and(
            eq(crafts.playerId, playerId),
            eq(crafts.status, 'completed'),
            inArray(crafts.recipeId, combatRecipeIds),
            lt(crafts.raidsUsed, MAX_EQUIPMENT_RAIDS),
          ),
        )
    },
  }
}
