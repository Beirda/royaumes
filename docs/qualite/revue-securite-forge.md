# Revue de sécurité de la Forge : intégrité des confections et des transferts

- Date : 2026-10-31
- Périmètre : API du module Forge (`/api/forge`), gestionnaires de messages de la Forge, saga orchestrée avec le Village, canal temps réel de la Forge et contributeur RGPD.
- Références : OWASP Top 10 (A01 Broken Access Control, A04 Insecure Design, A08 Software and Data Integrity Failures).

| N° | Exigence | Vérification | Constat | Statut |
| --- | --- | --- | --- | --- |
| F1 | Un joueur ne lance, n'annule et ne récupère une fabrication qu'en son propre nom | Lecture de `src/modules/forge/api.ts` et test « refuse l’annulation ou la récupération par un autre joueur (403) » | Toutes les routes extraient l'identité du joueur depuis `c.var.userId` sans accepter d'identifiant arbitraire dans la requête. | Conforme |
| F2 | Seul le propriétaire d'une confection peut l'annuler et déclencher le remboursement des ressources | Test « refuse l’annulation ou la récupération par un autre joueur (403) » et règle métier 8 dans `craft.test.ts` | L'annulation par un tiers est rejetée avec l'erreur `NOT_OWNER` (HTTP 403) et aucun message de remboursement n'est produit. | Conforme |
| F3 | Seules les recettes officielles du catalogue peuvent faire l'objet d'un ordre de fabrication | Schéma Zod `StartCraftInput`, test « refuse un corps de requête invalide (400) » et test de domaine « Règle 1 » | L'entrée est validée à l'entrée de l'API par Zod et le domaine rejette toute recette non répertoriée avec `UNKNOWN_RECIPE`. | Conforme |
| F4 | Aucun mouvement frauduleux ne peut créer ou dupliquer de ressources par des annulations répétées ou concurrentes | Test « Règle 7 : impossible d'annuler ou réclamer une fabrication terminée/annulée/rejetée » et test de saga | L'état passe à `cancelled` de façon atomique sous concurrence optimiste ; une deuxième tentative échoue avec `ALREADY_CANCELLED`. | Conforme |
| F5 | Un objet forgé ne peut être récupéré avant l'échéance de fabrication appréciée par le serveur | Test « refuse de réclamer un objet avant son échéance (409) » et test de domaine « Règle 6 » | L'échéance `readyAt` est strictement comparée à l'horloge du serveur (`now < state.readyAt`) ; la tentative prématurée est refusée avec `NOT_READY`. | Conforme |
| F6 | Les messages de réponse du Village (`forge.transfer-result`) sont traités de façon idempotente | Test « Règle 9 : les réponses du Village sont idempotentes et répétées sans effet » | Si l'état n'est plus en attente de réservation (`reserving`), la réponse répétée est ignorée sans émettre d'événement ni d'effet de bord. | Conforme |
| F7 | Le canal temps réel de la Forge ne divulgue aucune donnée sensible à d'autres joueurs | Test « annonce sur son canal temps réel les événements de la forge sans leurs données (canal discret B1) » | Le canal est configuré avec `redact: true` : seules la position et le type sont transmis, les données d'événements sont masquées. | Conforme |
| F8 | Aucune route de la Forge n'est accessible sans authentification | Test « refuse une requête anonyme (401) » dans `forge-api.test.ts` | Les intergiciels `requireUser(auth)` sur `/forge` et `/forge/*` bloquent toute requête non authentifiée avec une erreur 401. | Conforme |
| F9 | Les données personnelles associées aux fabrications sont intégralement protégées et anonymisées lors d'un effacement | Tests de `src/modules/forge/personal-data.test.ts` | L'export JSON retourne les confections de l'utilisateur, l'effacement anonymise le nom dans le journal (`ERASED_NAME`) et met à jour la table `crafts`. | Conforme |

## Synthèse

- **Exigences conformes** : 9
- **Exigences non conformes** : 0
- **Exigences en risque accepté** : 0

### Actions décidées
Toutes les exigences de sécurité et de contrôle d'accès sont satisfaites et vérifiées par des tests automatisés dans la suite de tests du projet (`pnpm verify`). Aucune action corrective n'est en attente.

