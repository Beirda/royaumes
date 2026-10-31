# Rendu de l'évaluation

- Auteur : Adrien
- Module : `forge`
- Adresse du déploiement : https://royaumes-omega.vercel.app
- Fiche de cadrage : [fiche-cadrage.md](fiche-cadrage.md)

## Exigences minimales

| N° | Fichiers principaux | Tests qui la vérifient |
| --- | --- | --- |
| E1 | `src/modules/forge/{domain,application,infrastructure,api.ts,contracts.ts,index.ts,ui.tsx}` | `pnpm lint:archi` (`.dependency-cruiser.cjs`) |
| E2 | `src/bootstrap/create-api.ts`, `app/(jeu)/forge/page.tsx`, `src/ui/app-shell.tsx` | `src/bootstrap/create-api.test.ts`, `src/bootstrap/forge-api.test.ts` |
| E3 | `src/modules/forge/domain/{recipes.ts,craft.ts,saga.ts,view.ts}` | `src/modules/forge/domain/craft.test.ts` |
| E4 | `src/modules/forge/infrastructure/schema.ts`, `drizzle/0013_forge.sql` | `src/bootstrap/architecture.test.ts`, `src/modules/forge/infrastructure/crafts-projection.test.ts` |
| E5 | `src/modules/forge/api.ts`, `src/modules/forge/contracts.ts` | `src/bootstrap/forge-api.test.ts` |
| E6 | `src/modules/forge/application/forge-service.ts`, `src/modules/forge/messages.ts` | `src/modules/forge/application/forge-service.test.ts` |
| E7 | `src/modules/forge/personal-data.ts` | `src/bootstrap/architecture.test.ts`, `src/modules/forge/personal-data.test.ts` |
| E8 | `src/modules/forge/domain/craft.test.ts`, `src/bootstrap/forge-api.test.ts` | `src/modules/forge/domain/craft.test.ts`, `src/bootstrap/forge-api.test.ts` |
| E9 | `.dependency-cruiser.cjs`, `src/bootstrap/architecture.test.ts` | `pnpm verify` |
| E10 | `package.json`, `scripts/migrate.ts`, `drizzle/0013_forge.sql` | `pnpm build` |

## Bonus revendiqués

| N° | Description | Fichiers | Tests | Documentation |
| --- | --- | --- | --- | --- |
| B1 | Canal temps réel propre au module, discret avec règle d'accès | `src/modules/forge/contracts.ts`, `src/modules/forge/index.ts` | `src/bootstrap/forge-api.test.ts` (test canal discret B1) | `README.md`, `docs/architecture.md` |
| B2 | Échéance sans tâche de fond (gestion paresseuse de la durée de confection) | `src/modules/forge/domain/craft.ts`, `src/modules/forge/application/forge-service.ts` | `src/modules/forge/domain/craft.test.ts` (Règle 6), `src/bootstrap/forge-api.test.ts` | `docs/adr/0010-forge.md`, `README.md` |
| B4 | Modèle de lecture tenu par une projection, avec son point de reprise et sa version | `src/modules/forge/infrastructure/crafts-projection.ts`, `src/modules/forge/infrastructure/drizzle-crafts-reader.ts` | `src/modules/forge/infrastructure/crafts-projection.test.ts` | `docs/adr/0010-forge.md` |
| B5 | Saga avec au moins une étape compensable entre la Forge et le Village (remboursement intégral en cas d'annulation) | `src/modules/forge/domain/saga.ts`, `src/modules/forge/application/forge-service.ts` | `src/modules/forge/domain/craft.test.ts` (Règle 5), `src/modules/forge/application/forge-service.test.ts` | `docs/adr/0010-forge.md` |
| B8 | Nouvelle fonction d'aptitude protégeant la validité et la pureté des recettes de la Forge | `src/bootstrap/architecture.test.ts` | `src/bootstrap/architecture.test.ts` | `docs/architecture.md` |

## Écarts avec la fiche de cadrage

Aucun

## Indicateurs au rendu

| Indicateur | À l'étiquette `td11-fin` | Au rendu |
| --- | --- | --- |
| Nombre de tests | 237 | 272 |
| Couverture des lignes | 74.8 % | 75.2 % |
| Violations des règles d'architecture | 0 | 0 |

## Usage de l'IA générative

Outils utilisés, nature de leur contribution pour chaque partie du travail (code, tests, documents), et manière dont les résultats ont été vérifiés :
- **Code du module Forge** : Utilisation pour la complétion automatique de code, la correction des bugs et la correction de bug, ainsi que pour une refonte de l'interface (pour les autres modulesz aussi).
- **Tests** : Mis een place des tests.
- **Documentation** : Mise au propre de la fiche de rendu et de l'ADR 0010.
