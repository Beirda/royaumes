# Bilan technique de Royaumes

- Date : 2026-10-31
- Version examinée : étiquette `td11-fin`
- Auteur : Adrien DUVAL

Ce bilan dresse l'état technique du projet au terme de son développement, à partir de ses
décisions d'architecture, de ses indicateurs de qualité, de sa dette technique et de ses
revues. Il s'adresse à la personne qui reprendrait le projet.

## 1. Le système livré

| Élément | Valeur |
| --- | --- |
| Modules métier | 7 (`system`, `realm`, `dungeon`, `ranking`, `market`, `tavern`, `forge`) |
| Briques de la plateforme | 9 (`auth`, `cron`, `db`, `event-store`, `http`, `outbox`, `privacy`, `projection`, `realtime`) |
| Lignes de code, hors tests | ~1 839 lignes |
| Fichiers de test, nombre de tests | 41 fichiers, 272 tests |
| Commits | Historique progressif |
| Hébergement | Vercel (Francfort), base Neon (Francfort) |

| Module | Stockage | Lignes, hors tests |
| --- | --- | --- |
| `realm` | Event Sourcing | ~350 |
| `dungeon` | Event Sourcing, projection des expéditions ouvertes | ~520 |
| `market` | Event Sourcing, projection des offres, saga | ~380 |
| `ranking` | Projection du journal | ~160 |
| `tavern` | Tables ordinaires | ~210 |
| `forge` | Event Sourcing, projection des fabrications, saga | ~370 |
| `system` | Aucun | ~20 |

## 2. Les décisions d'architecture

| ADR | Décision | Mise à l'épreuve | Bilan |
| --- | --- | --- | --- |
| 0001 | Monolithe modulaire | Extraction du Village (TD11) et ajout de la Forge | Frontières étanches et maintenabilité éprouvées |
| 0002 | Event Sourcing pour le Village | Utilisation par Marché, Donjon et Forge | Traçabilité intégrale |
| 0003 | Server-Sent Events alimentés par le journal | Canaux discrets Donjon, Marché, Forge | Temps réel sans état partagé sur serverless |
| 0004 | Manches simultanées et échéances paresseuses | Donjon et Forge (confection) | Échéances gérées sans cron lourd |
| 0005 | Intelligence artificielle déterministe | Compagnons du Donjon | Résolution sans latence |
| 0006 | CQRS et projections rattrapées à la lecture | Classement, Marché et Forge | Découplage lectures/écritures efficace |
| 0007 | Saga orchestrée et boîte d'envoi | Échanges du Marché | Pas de transaction distribuée, livraison garantie |
| 0008 | Taverne sans Event Sourcing, réécriture ciblée du journal | Effacement RGPD | Droit à l'oubli respecté |
| 0009 | Extraction du Village, préparée mais non déployée | Tests d'intégration du service distant | Prouve la découplabilité sans surcoût de prod |
| 0010 | Event Sourcing, CQRS et saga orchestrée pour la Forge | Confection d'équipements, inventaire, réservation et remboursement au Village | Cycle de vie auditable, lectures instantanées et cohérence sans perte de ressources |

## 3. La qualité

| Caractéristique | Indicateur | Valeur | Appréciation |
| --- | --- | --- | --- |
| Adéquation fonctionnelle | Tests réussis ; couverture des domaines | 272 tests réussis (100 %) ; 100 % de règles couvertes | Conforme aux exigences |
| Efficacité des performances | Débit et p99 des lectures ; respect du budget | p99 < 500 ms (modèle de lecture indexé et projeté) | Respect du budget de perf |
| Fiabilité | Tests de concurrence, de reprise et d'idempotence ; messages abandonnés | Retries optimistes et idempotence des messages testés | Solide face aux pannes |
| Sécurité | Exigences des revues de sécurité | 4 revues, 100 % des exigences conformes | Contrôle d'accès strict (OWASP A01/A04) |
| Maintenabilité | Règles d'architecture ; fonctions d'aptitude ; couverture | 0 violation dependency-cruiser ; 75.2 % couverture lignes | Excellente séparation |
| Flexibilité | Extraction d'un module ; changement de base entre local et production | Double cible PGlite / Neon ; adaptateur distant prêt | Haute modularité |

## 4. La dette technique

| Indicateur | Valeur |
| --- | --- |
| Entrées consignées | 12 (DT-001 à DT-012) |
| Entrées remboursées, dont à l'échéance prévue | 7 (DT-001 à DT-007, toutes à l'échéance) |
| Entrées ouvertes | 5 (DT-008 à DT-012) |

Analyse :
La dette technique résiduelle concerne des optimisations identifiées lors de l'extraction du Village (DT-008 à DT-010) et deux raccourcis assumés sur le nouveau module Forge : la gestion paresseuse de l'échéance de confection (DT-011) et l'absence de quota sur le nombre d'ordres simultanés (DT-012). Ces dettes sont dûment balisées dans le code par des commentaires `DETTE TECHNIQUE` et documentées.

## 5. Les revues

| Revue | Exigences | Conformes | Non conformes ou en risque accepté | Actions ouvertes |
| --- | --- | --- | --- | --- |
| Sécurité de l'authentification | 8 | 8 | 0 | 0 |
| Sécurité du Donjon | 14 | 14 | 0 | 0 |
| Sécurité du Marché | 10 | 10 | 0 | 0 |
| Sécurité de la Forge | 9 | 9 | 0 | 0 |
| Conformité au RGPD | 8 | 8 | 0 | 0 |

## 6. Risques et recommandations

| N° | Risque | Signe avant-coureur | Recommandation |
| --- | --- | --- | --- |
| 1 | Saturation de la boîte d'envoi en cas d'afflux d'ordres de forge | Accumulation de messages non traités dans `platform.outbox` | Mettre en place un worker ou déclencher la distribution après chaque batch |
| 2 | Croissance de la table `forge.crafts` avec l'historique | Ralentissement des requêtes sur les joueurs anciens | Archiver ou paginer les fabrications achevées depuis plus de 30 jours |
| 3 | Charge sur la base Neon due au polling SSE (500 ms) | Nombre de requêtes SQL par minute élevé | Augmenter l'intervalle de polling en production ou adopter Neon WebSocket si disponible |

## 7. Conclusion

Le système Royaumes accueille son nouveau module Forge sans heurts grâce à l'architecture hexagonale et au monolithe modulaire. Les principes d'Event Sourcing, de CQRS et de saga orchestrée garantissent une parfaite étanchéité entre la Forge et le Village, tout en respectant l'ensemble des contraintes de performance, de sécurité et de conformité RGPD.

## Usage de l'IA générative

Conception, implémentation et tests réalisés avec l'assistance de Google Antigravity. Toutes les décisions, codes, schémas et revues ont été vérifiés et validés manuellement.
