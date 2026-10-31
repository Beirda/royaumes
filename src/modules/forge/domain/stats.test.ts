import { describe, expect, it } from 'vitest'
import { BASE_HERO_STATS, calculatePlayerStats } from './stats'

describe('Forge - Calcul des statistiques du héros', () => {
  it('renvoie les statistiques de base pour un joueur sans équipement', () => {
    const stats = calculatePlayerStats([])

    expect(stats.base).toEqual(BASE_HERO_STATS)
    expect(stats.bonus).toEqual({ attack: 0, defense: 0, hp: 0 })
    expect(stats.total).toEqual({ attack: 6, defense: 0, hp: 30 })
    expect(stats.itemsCount).toBe(0)
    expect(stats.specialEffects).toEqual([])
  })

  it('cumule la production de pierre d’une pioche et de bois d’une hache', () => {
    const stats = calculatePlayerStats(['pickaxe', 'axe'])

    expect(stats.productionBonus).toEqual({ stone: 3, wood: 5 })
    expect(stats.specialEffects).toContain('Pioche de maître : +3 Pierre/min au Village')
    expect(stats.specialEffects).toContain('Hache de bûcheron : +5 Bois/min au Village')
  })

  it('cumule plusieurs équipements différents (attaque, défense, PV et effets spéciaux)', () => {
    const stats = calculatePlayerStats(['sword', 'shield', 'armor', 'crown'])

    // Attaque : base 6 + épée 6 + couronne 4 = 16
    expect(stats.bonus.attack).toBe(10)
    expect(stats.total.attack).toBe(16)

    // Défense : base 0 + bouclier 4 + armure 3 + couronne 3 = 10
    expect(stats.bonus.defense).toBe(10)
    expect(stats.total.defense).toBe(10)

    // PV : base 30 + armure 15 + couronne 10 = 55
    expect(stats.bonus.hp).toBe(25)
    expect(stats.total.hp).toBe(55)

    expect(stats.itemsCount).toBe(4)
    expect(stats.specialEffects).toContain('Couronne royale : Prestige royal (+10% butin Donjon)')
  })
})
