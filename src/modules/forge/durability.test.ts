import { describe, expect, it } from 'vitest'
import { createTestApi } from '@/bootstrap/testing'
import type { ForgeOverview } from './contracts'

describe('Forge - Durabilité et limites d’utilisation des objets', () => {
  it('limite les bonus de combat des armes et armures à 2 raids de donjon', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Alice forge une épée de fer (+6 ATK)
    const craftRes = await api.post('/api/forge/crafts', { recipeId: 'sword' }, 'alice')
    const { craftId } = (await craftRes.json()) as { craftId: string }

    api.advance(1)
    await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'alice')

    // Raid 1 : l'épée est active (12 ATK au lieu de 6)
    const raid1 = await api.post('/api/dungeon/games', {}, 'alice')
    const view1 = ((await raid1.json()) as { view: { heroes: { id: string; attack: number }[] } })
      .view
    const hero1 = view1.heroes.find((h) => h.id === 'alice')
    expect(hero1?.attack).toBe(12) // 6 base + 6 épée (1/2 raid utilisé)

    // Raid 2 : l'épée est toujours active pour son second raid (12 ATK)
    const raid2 = await api.post('/api/dungeon/games', {}, 'alice')
    const view2 = ((await raid2.json()) as { view: { heroes: { id: string; attack: number }[] } })
      .view
    const hero2 = view2.heroes.find((h) => h.id === 'alice')
    expect(hero2?.attack).toBe(12) // 6 base + 6 épée (2/2 raids utilisés)

    // Raid 3 : la limite de 2 raids est atteinte, l'épée est épuisée !
    const raid3 = await api.post('/api/dungeon/games', {}, 'alice')
    const view3 = ((await raid3.json()) as { view: { heroes: { id: string; attack: number }[] } })
      .view
    const hero3 = view3.heroes.find((h) => h.id === 'alice')
    expect(hero3?.attack).toBe(6) // Retour à l'attaque de base naturelle !

    // Vérification dans l'inventaire : 0 raid restant
    const overview = (await (await api.get('/api/forge', 'alice')).json()) as ForgeOverview
    const item = overview.inventory.find((i) => i.craftId === craftId)
    expect(item?.raidsUsed).toBe(2)
    expect(item?.raidsRemaining).toBe(0)
    expect(item?.isExpired).toBe(true)
  })

  it('limite l’augmentation de rendement des outils à 15 minutes', async () => {
    const api = await createTestApi()
    await api.post('/api/realm/village', { name: 'Village d’Alice' }, 'alice')

    // Taux de base de la carrière (niveau 1) : 6 pierres/min
    const baseVillage = (
      (await (await api.get('/api/realm/village', 'alice')).json()) as {
        view: { ratesPerMinute: { stone: number } }
      }
    ).view
    expect(baseVillage.ratesPerMinute.stone).toBe(6)

    // Alice forge une pioche de maître (+3 Pierre / min)
    const craftRes = await api.post('/api/forge/crafts', { recipeId: 'pickaxe' }, 'alice')
    const { craftId } = (await craftRes.json()) as { craftId: string }

    api.advance(1)
    await api.post(`/api/forge/crafts/${craftId}/claim`, {}, 'alice')

    // Pendant les 15 premières minutes (ex: après 5 minutes) : le bonus de +3 pierre/min est actif
    api.advance(5)
    const activeVillage = (
      (await (await api.get('/api/realm/village', 'alice')).json()) as {
        view: { ratesPerMinute: { stone: number } }
      }
    ).view
    expect(activeVillage.ratesPerMinute.stone).toBe(9) // 6 base + 3 pioche

    // Après 16 minutes au total : la limite de 15 minutes est dépassée
    api.advance(11) // 5 + 11 = 16 minutes écoulées
    const expiredVillage = (
      (await (await api.get('/api/realm/village', 'alice')).json()) as {
        view: { ratesPerMinute: { stone: number } }
      }
    ).view
    expect(expiredVillage.ratesPerMinute.stone).toBe(6) // Retour au taux normal sans le bonus !
  })
})
