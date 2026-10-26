# ADR-0008 - Stockage classique pour la Taverne, et réécriture ciblée du journal pour l'effacement

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le projet doit respecter le Règlement Général sur la Protection des Données (RGPD) : droit à l'effacement (« droit à l'oubli », article 17), droit à la portabilité (article 20), et respect des durées de conservation limitées.

Le jeu gère deux catégories d'informations bien distinctes :
- Les données de jeu (Village, Donjon, Marché), gérées en Event Sourcing, où l'historique ordonné des événements est indispensable au rejeu et à la validité des calculs.
- Les données de la Taverne (messages du salon et statut de présence), qui sont purement conversationnelles et éphémères.

Supprimer brutalement des événements d'un joueur dans le journal casserait la continuité des versions des flux et empêcherait le rejeu de parties partagées avec d'autres participants. À l'inverse, consigner des discussions instantanées dans un journal immuable obligerait à réécrire en permanence le journal pour purger les anciens messages.

## Décision

Le mode de stockage et la gestion des données personnelles s'adaptent à la nature des données :

- **Taverne en tables relationnelles classiques** : les messages (`tavern.messages`) et la présence (`tavern.presence`) n'utilisent pas l'Event Sourcing. Les messages sont purgés après 30 jours par la tâche quotidienne planifiée. La présence est mise à jour sur place et supprimée après deux minutes sans signal.
- **Réécriture ciblée du journal pour l'effacement** : lors de la suppression d'un compte, les événements ne sont pas effacés physiquement (afin de préserver la continuité des versions et le rejeu pour les autres joueurs). En revanche, les données personnelles identifiantes (`name`, `villageName`) sont anonymisées sur place avec des mentions neutres (« Joueur effacé », « Village effacé »).
- Cette réécriture ciblée, orchestrée par la brique `privacy`, constitue la seule exception du projet à l'immuabilité du journal `platform.events`.
- Chaque module déclare un `PersonalDataContributor` pour exporter ses données et appliquer l'effacement sur ses propres tables.
- L'effacement est tracé dans un registre anonyme (`platform.erasures`) n'enregistrant que la date et le nombre d'événements réécrits.

## Conséquences

### Positives

- Conformité claire au RGPD sans fragiliser le fonctionnement technique du jeu.
- Nettoyage simple des messages de discussion grâce à des instructions SQL `DELETE` indexées.
- Intégrité préservée de l'Event Sourcing : les expéditions de donjon passées et les échanges du marché restent rejouables et cohérents même après le départ d'un participant.
- Chaque module garde la responsabilité de ses propres données personnelles.

### Négatives

- Exception assumée à la règle d'immuabilité du journal d'événements.
- La réécriture du journal nécessite de parcourir les événements dont le flux ou les données textuelles mentionnent l'identifiant du joueur.

## Alternatives écartées

- **Event Sourcing pour la Taverne** : rejeté car enregistrer des milliers de messages voués à disparaître après 30 jours encombrerait inutilement le journal et exigerait des réécritures permanentes.
- **Suppression physique des événements dans le journal** : rejeté car cela créerait des trous de version, romprait le calcul de l'état des autres joueurs et casserait la vérification d'intégrité.
- **Chiffrement avec destruction de clé (*crypto-shredding*)** : rejeté car la gestion de clés individuelles par joueur ajouterait une lourde complexité disproportionnée pour ce projet.

## Réexamen

Cette décision pourra être réexaminée si le volume d'événements dans le journal rend la recherche et la réécriture trop coûteuses lors d'une suppression de compte, ce qui justifierait d'isoler l'identité dans une table de correspondance séparée.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.