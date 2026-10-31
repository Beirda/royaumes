import { Hono } from 'hono'
import type { AppEnv } from '@/platform/http/types'
import { validateJson } from '@/platform/http/validate'
import type { ForgeService } from './application/forge-service'
import { type CraftError, StartCraftInput } from './contracts'

/** Code HTTP associé à chaque erreur métier. */
const STATUS: Record<CraftError['code'], 400 | 403 | 404 | 409> = {
  CRAFT_NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  UNKNOWN_RECIPE: 400,
  NOT_OWNER: 403,
  CANNOT_CANCEL: 409,
  ALREADY_CANCELLED: 409,
  ALREADY_COMPLETED: 409,
  ALREADY_REJECTED: 409,
  NOT_READY: 409,
  ALREADY_CLAIMED: 409,
}

/**
 * Sous-application Hono du module Forge, montée sur /api/forge.
 * Toutes les routes sont protégées et utilisent le contexte d'authentification.
 */
export function createForgeApi(service: ForgeService) {
  return (
    new Hono<AppEnv>()
      // Vue globale : catalogue des recettes, atelier et inventaire
      .get('/', async (c) => c.json(await service.overview(c.var.userId)))

      // Lancement d'une fabrication
      .post('/crafts', validateJson(StartCraftInput), async (c) => {
        const { recipeId } = c.req.valid('json')
        const player = { id: c.var.userId, name: c.var.userName }
        const { craftId, result } = await service.startCraft(player, recipeId)
        return result.ok
          ? c.json({ craftId, view: result.view }, 201)
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Consultation d'une fabrication
      .get('/crafts/:id', async (c) => {
        const view = await service.getCraft(c.req.param('id'), c.var.userId)
        return view
          ? c.json({ view })
          : c.json({ error: { code: 'CRAFT_NOT_FOUND' as const } }, 404)
      })

      // Annulation d'une fabrication en cours
      .post('/crafts/:id/cancel', async (c) => {
        const result = await service.cancelCraft(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })

      // Récupération d'un objet forgé achevé
      .post('/crafts/:id/claim', async (c) => {
        const result = await service.claimItem(c.req.param('id'), c.var.userId)
        return result.ok
          ? c.json({ view: result.view })
          : c.json({ error: result.error }, STATUS[result.error.code])
      })
  )
}

export type ForgeApi = ReturnType<typeof createForgeApi>
