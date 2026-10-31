import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { createTestDatabase } from '@/platform/db/client'

/** Répertoires des modules métier. */
const MODULES = readdirSync(path.join(process.cwd(), 'src/modules'))

/**
 * Fonctions d'aptitude (TD11) : des règles d'architecture que dependency-cruiser ne peut pas
 * vérifier, parce qu'elles ne portent pas sur les importations, sont vérifiées par des tests.
 */
describe("Fonctions d'aptitude", () => {
  it("range chaque table dans le schéma d'une brique de la plateforme ou d'un module", async () => {
    const db = await createTestDatabase()
    const result = await db.execute(sql`
      SELECT DISTINCT table_schema FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')`)
    const schemas = (result as unknown as { rows: { table_schema: string }[] }).rows.map(
      (row) => row.table_schema,
    )

    // Aucune table dans le schéma public, et chaque schéma correspond à un propriétaire connu.
    const owners = ['platform', 'identity', ...MODULES]
    expect(schemas).not.toContain('public')
    for (const schema of schemas) expect(owners).toContain(schema)
  })

  it('déclare les données personnelles de chaque module qui conserve des données', () => {
    // Le module system ne conserve aucune donnée ; tous les autres doivent participer
    // aux droits des joueurs (TD10).
    const withData = MODULES.filter((module) => module !== 'system')
    for (const module of withData) {
      const file = path.join(process.cwd(), 'src/modules', module, 'personal-data.ts')
      expect(existsSync(file), `${module} n'a pas de fichier personal-data.ts`).toBe(true)
    }
  })

  it("garantit que chaque recette de la Forge est valide et n'utilise que les ressources du Village avec des coûts strictement positifs (Bonus B8)", async () => {
    const { RECIPES } = await import('@/modules/forge/contracts')
    const { RESOURCES } = await import('@/modules/realm/contracts')

    const recipes = Object.values(RECIPES)
    expect(recipes.length).toBeGreaterThan(0)
    for (const recipe of recipes) {
      expect(recipe.durationMs).toBeGreaterThan(0)
      const costKeys = Object.keys(recipe.cost) as (keyof typeof recipe.cost)[]
      expect(costKeys.length).toBeGreaterThan(0)
      for (const res of costKeys) {
        expect(RESOURCES).toContain(res)
        const amount = recipe.cost[res]
        expect(typeof amount).toBe('number')
        expect(Number(amount)).toBeGreaterThan(0)
      }
    }
  })
})
