import { describe, expect, it } from 'vitest'
import type { ForgeOverview } from '@/modules/forge/contracts'
import type { Stock } from '@/modules/realm/contracts'
import { createTestApi } from './testing'

type TestApi = Awaited<ReturnType<typeof createTestApi>>

/** Stock du village d'un joueur. */
async function stockOf(api: TestApi, player: string): Promise<Stock> {
  const res = await api.get('/api/realm/village', player)
  return ((await res.json()) as { view: { stock: Stock } }).view.stock
}

describe('API du module Forge', () => {
  it('refuse une requête anonyme (401)', async () => {
    const api = await createTestApi()
    expect((await api.get('/api/forge', null)).status).toBe(401)
    expect((await api.post('/api/forge/crafts', { recipeId: 'sword' }, null)).status).toBe(401)
  })

  it('refuse un corps de requête invalide (400)', async () => {
    const api = await createTestApi()
    const res = await api.post('/api/forge/crafts', { recipeId: 'invalid_item' }, 'alice')
    expect(res.status).toBe(400)
  })

  it('lance une confection, réserve les ressources au Village et progresse vers in_progress (201)', async () => {
    const api = await createTestApi()
    // Alice fonde son village (100 bois, 50 pierre, 0 or)
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')
    expect((await stockOf(api, 'alice')).wood).toBe(100)
    expect((await stockOf(api, 'alice')).stone).toBe(50)

    // Lancement de la fabrication d'une épée (20 bois, 10 pierre)
    const res = await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')
    expect(res.status).toBe(201)
    const data = (await res.json()) as { craftId: string; view: { status: string } }
    expect(data.craftId).toBeDefined()
    expect(data.view.status).toBe('in_progress')

    // Les ressources ont été prélevées du village d'Alice
    const stock = await stockOf(api, 'alice')
    expect(stock.wood).toBe(80)
    expect(stock.stone).toBe(40)
  })

  it('rejette la fabrication lorsque le village ne possède pas les ressources nécessaires', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Couronne royale : requiert 50 or, Alice a 0 or
    const res = await api.post('/api/forge/crafts', { recipeId: 'crown' }, 'alice')
    expect(res.status).toBe(201)
    const data = (await res.json()) as { craftId: string; view: { status: string } }
    expect(data.view.status).toBe('rejected')

    // Les stocks n'ont pas diminué
    const stock = await stockOf(api, 'alice')
    expect(stock.wood).toBe(100)
    expect(stock.stone).toBe(50)
  })

  it('restitue intégralement les ressources au Village en cas d’annulation (étape compensable)', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Alice lance un bouclier (30 bois, 20 pierre)
    const startRes = await api.post('/api/forge/crafts', { recipeId: 'shield' }, 'alice')
    const { craftId } = (await startRes.json()) as { craftId: string }

    expect((await stockOf(api, 'alice')).wood).toBe(70)
    expect((await stockOf(api, 'alice')).stone).toBe(30)

    // Alice annule sa confection
    const cancelRes = await api.post(`/api/forge/crafts/${craftId}/cancel`, {}, 'alice')
    expect(cancelRes.status).toBe(200)

    // Les ressources ont été remboursées intégralement
    const refundedStock = await stockOf(api, 'alice')
    expect(refundedStock.wood).toBe(100)
    expect(refundedStock.stone).toBe(50)
  })

  it('refuse l’annulation ou la récupération par un autre joueur (403)', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    const startRes = await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')
    const { craftId } = (await startRes.json()) as { craftId: string }

    // Bob essaie d'annuler la fabrication d'Alice
    const bobCancel = await api.post(`/api/forge/crafts/${craftId}/cancel`, {}, 'bob')
    expect(bobCancel.status).toBe(403)

    // Bob essaie de réclamer l'épée d'Alice
    const bobClaim = await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'bob')
    expect(bobClaim.status).toBe(403)
  })

  it('refuse de réclamer un objet avant son échéance (409) et l’ajoute à l’inventaire après (200)', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    const startRes = await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')
    const { craftId } = (await startRes.json()) as { craftId: string }

    // Réclamation immédiate refusée
    const earlyClaim = await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'alice')
    expect(earlyClaim.status).toBe(409)

    // L'horloge avance de 2 minutes
    api.advance(2)

    // Réclamation réussie
    const claimRes = await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'alice')
    expect(claimRes.status).toBe(200)
    const claimData = (await claimRes.json()) as { view: { status: string } }
    expect(claimData.view.status).toBe('completed')

    // Consultation de l'inventaire et des statistiques via GET /api/forge
    const overviewRes = await api.get('/api/forge', 'alice')
    expect(overviewRes.status).toBe(200)
    const overview = (await overviewRes.json()) as ForgeOverview
    expect(overview.inventory).toHaveLength(1)
    expect(overview.inventory[0].recipeId).toBe('sword')
    expect(overview.inventory[0].status).toBe('completed')
    // Les statistiques du joueur ont augmenté : 6 (base) + 6 (épée) = 12 en attaque
    expect(overview.stats.total.attack).toBe(12)
    expect(overview.stats.bonus.attack).toBe(6)
  })

  it('applique les bonus d’attaque et de défense de la Forge dans les expéditions du Donjon', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Alice forge une épée (+6 ATK) et un bouclier (+4 DEF)
    const swordRes = await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')
    const { craftId: swordId } = (await swordRes.json()) as { craftId: string }
    const shieldRes = await api.post('/api/forge/crafts', { recipeId: 'shield' }, 'alice')
    const { craftId: shieldId } = (await shieldRes.json()) as { craftId: string }

    // Temps de trempe écoulé
    api.advance(1)

    // Récupération des deux objets
    await api.post(`/api/forge/crafts/${swordId}/claim`, {}, 'alice')
    await api.post(`/api/forge/crafts/${shieldId}/claim`, {}, 'alice')

    // Alice crée maintenant une expédition dans le Donjon
    const gameRes = await api.post('/api/dungeon/games', {}, 'alice')
    expect(gameRes.status).toBe(201)
    const { view } = (await gameRes.json()) as {
      view: { heroes: { id: string; attack: number; defense: number; hp: number }[] }
    }

    // Le héros d'Alice bénéficie immédiatement de ses armes forgées !
    const aliceHero = view.heroes.find((h) => h.id === 'alice')
    expect(aliceHero).toBeDefined()
    expect(aliceHero?.attack).toBe(12) // 6 base + 6 épée
    expect(aliceHero?.defense).toBe(4) // 0 base + 4 bouclier
  })

  it('augmente le rendement et la production du Village lorsqu’un outil (pioche) est forgé', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Taux initial de la carrière (niveau 1) : 6 pierres/min
    const initialVillage = (
      (await (await api.get('/api/realm/village', 'alice')).json()) as {
        view: { ratesPerMinute: { stone: number } }
      }
    ).view
    expect(initialVillage.ratesPerMinute.stone).toBe(6)

    // Alice forge une pioche de maître (coût: 25 bois, 15 pierre)
    const pickRes = await api.post('/api/forge/crafts', { recipeId: 'pickaxe' }, 'alice')
    const { craftId } = (await pickRes.json()) as { craftId: string }

    // Temps de forge écoulé
    api.advance(1)

    // Récupération de la pioche
    await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'alice')

    // Le Village d'Alice bénéficie immédiatement du bonus d'extraction de la pioche (+3 pierre/min)
    const upgradedVillage = (
      (await (await api.get('/api/realm/village', 'alice')).json()) as {
        view: { ratesPerMinute: { stone: number } }
      }
    ).view
    expect(upgradedVillage.ratesPerMinute.stone).toBe(9) // 6 base + 3 pioche
  })

  it('annonce sur son canal temps réel les événements de la forge sans leurs données (canal discret B1)', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')
    await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')

    const res = await api.get('/api/stream/forge/events?after=0', 'alice')
    expect(res.status).toBe(200)
    const { events } = (await res.json()) as {
      events: { type: string; data: Record<string, unknown> }[]
    }
    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'CraftStarted')).toBe(true)
    for (const event of events) {
      expect(event.data).toEqual({})
    }
  })
})
