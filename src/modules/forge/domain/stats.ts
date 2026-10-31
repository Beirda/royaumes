/**
 * Calcul et agrégation des statistiques de combat conférées par l'équipement de la Forge.
 * Domaine pur : aucune dépendance technique.
 */

import { type Amounts, RECIPES, type RecipeId } from './recipes'

/** Limite maximale d'expéditions de donjon pour un équipement de combat. */
export const MAX_EQUIPMENT_RAIDS = 2

/** Durée d'efficacité d'un outil de rendement (15 minutes en millisecondes). */
export const TOOL_DURATION_MS = 15 * 60_000

export interface OwnedItemSpec {
  recipeId: RecipeId
  raidsUsed?: number
  completedAt?: number | null
}

export interface CombatStats {
  attack: number
  defense: number
  hp: number
}

export interface HeroStatsOverview {
  /** Statistiques naturelles du héros (sans aucun équipement). */
  base: CombatStats
  /** Bonus cumulés conférés par tous les équipements actuellement dans l'inventaire. */
  bonus: CombatStats
  /** Statistiques totales (base + bonus). */
  total: CombatStats
  /** Bonus de production par minute au Village. */
  productionBonus: Amounts
  /** Nombre d'équipements forgés et actifs. */
  itemsCount: number
  /** Effets passifs et bonus utilitaires actifs. */
  specialEffects: string[]
}

/** Caractéristiques de base d'un héros (identiques au Donjon). */
export const BASE_HERO_STATS: CombatStats = {
  attack: 6,
  defense: 0,
  hp: 30,
}

/**
 * Calcule les statistiques d'un joueur en fonction des objets forgés et récupérés,
 * en appliquant la durabilité des armes (2 raids max) et la durée de validité
 * des outils de rendement (15 minutes).
 */
export function calculatePlayerStats(
  items: (RecipeId | OwnedItemSpec)[],
  now = Date.now(),
): HeroStatsOverview {
  const bonus: CombatStats = { attack: 0, defense: 0, hp: 0 }
  const productionBonus: Amounts = {}
  const specialEffects: string[] = []
  let activeItemsCount = 0

  for (const raw of items) {
    const item: OwnedItemSpec = typeof raw === 'string' ? { recipeId: raw, raidsUsed: 0 } : raw
    const recipe = RECIPES[item.recipeId]
    if (!recipe) continue

    const raidsUsed = item.raidsUsed ?? 0
    const raidsRemaining = Math.max(0, MAX_EQUIPMENT_RAIDS - raidsUsed)
    const combatActive = raidsRemaining > 0

    // Vérification de la validité de 15 minutes pour les outils de rendement
    const toolActive = item.completedAt ? now - item.completedAt <= TOOL_DURATION_MS : true

    let itemContributed = false

    if (combatActive) {
      if (recipe.effect.attack) {
        bonus.attack += recipe.effect.attack
        itemContributed = true
      }
      if (recipe.effect.defense) {
        bonus.defense += recipe.effect.defense
        itemContributed = true
      }
      if (recipe.effect.hp) {
        bonus.hp += recipe.effect.hp
        itemContributed = true
      }
    }

    if (toolActive && recipe.effect.production) {
      for (const [res, amount] of Object.entries(recipe.effect.production)) {
        const key = res as keyof Amounts
        productionBonus[key] = (productionBonus[key] ?? 0) + (amount ?? 0)
      }
      itemContributed = true
    }

    if (recipe.effect.special) {
      const isProductionSpecial =
        !!recipe.effect.production && !recipe.effect.special.includes('Donjon')
      const isActive = isProductionSpecial ? toolActive : combatActive

      if (isActive) {
        specialEffects.push(`${recipe.name} : ${recipe.effect.special}`)
      }
    }

    if (itemContributed) {
      activeItemsCount++
    }
  }

  return {
    base: { ...BASE_HERO_STATS },
    bonus,
    total: {
      attack: BASE_HERO_STATS.attack + bonus.attack,
      defense: BASE_HERO_STATS.defense + bonus.defense,
      hp: BASE_HERO_STATS.hp + bonus.hp,
    },
    productionBonus,
    itemsCount: activeItemsCount,
    specialEffects,
  }
}
