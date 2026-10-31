import type { ForgeOverview } from '../contracts'

/** Port de lecture de la forge, défini par la couche application. */
export interface CraftsReader {
  /**
   * Renvoie la vue d'ensemble de la forge pour un joueur (recettes, confections et inventaire)
   * à l'instant now.
   */
  overview(playerId: string, now: number): Promise<ForgeOverview>

  /**
   * Enregistre la consommation d'une charge d'expédition de donjon sur les équipements
   * de combat actifs du joueur.
   */
  recordRaidUsage(playerId: string): Promise<void>
}
