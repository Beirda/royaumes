# ADR-0006 - CQRS : modèles de lecture tenus par des projections rattrapées à la lecture

- Statut : accepté
- Date : 2026-10-21

## Contexte

L'Event Sourcing stocke l'historique sous forme de flux ordonnés d'événements. Il est très performant pour enregistrer une action ou charger l'état d'un village ou d'un donjon précis à partir de son identifiant.

Néanmoins, plusieurs fonctionnalités réclament des vues d'ensemble transverses : afficher le classement des joueurs (`ranking`), lister les expéditions en attente de participants (`dungeon`), ou consulter les offres du marché (`market`).

Rejouer l'ensemble du journal d'événements à chaque consultation de ces pages deviendrait très vite intenable en temps de réponse et en charge machine.

Dans le même temps, l'environnement sans serveur de Vercel ne permet pas d'avoir un démon en tâche de fond qui consommerait le journal en continu pour alimenter des tables de lecture.

## Décision

Le système sépare écriture et lecture selon le motif CQRS (Command Query Responsibility Segregation), en mettant à jour les modèles de lecture au moment de la consultation (*catch-up on read*) :

- Les événements sont écrits en ajout seul dans le journal (`platform.events`), qui reste la source de vérité.
- Les modules qui en ont besoin définissent des tables de lecture relationnelles dédiées (schémas `ranking`, `dungeon`, `market`), optimisées pour la consultation directe.
- Lors d'une requête de lecture (par exemple l'affichage du classement), l'application appelle `catchUp(projection)` : elle lit les événements survenus depuis son dernier point de reprise (`platform.projections`) et met à jour ses tables dans la même transaction SQL.
- Une vérification préalable (`isUpToDate`) compare rapidement la position de la projection à la position maximale du journal pour éviter d'ouvrir une transaction d'écriture inutile quand rien n'a changé.
- Chaque projection porte un numéro de version. Si la logique ou les colonnes d'une projection changent, le moteur vide automatiquement ses tables (`reset`) et relit le journal depuis le début de façon transactionnelle (`rebuild`).

## Conséquences

### Positives

- Les requêtes de consultation restent de simples lectures SQL directes, indexées et très performantes.
- Aucun processus ni service d'arrière-plan permanent à héberger et surveiller : fonctionnement direct en sans-serveur.
- Les données consultées sont immédiatement à jour lors de la lecture, sans délai de cohérence éventuelle ressenti par le joueur.
- Reconstruction et reprise complètes facilitées en cas de modification de la structure de lecture.

### Négatives

- La première lecture qui suit une série d'écritures subit un léger surcoût de temps pour appliquer les nouveaux événements.
- Les données sont stockées deux fois : dans le journal d'événements brut et dans les tables dérivées.

## Alternatives écartées

- **Agrégation directe sur le journal d'événements** : rejeté car le coût de chaque consultation augmenterait avec l'historique complet de toutes les parties.
- **Mise à jour synchrone lors de l'écriture** : mettre à jour le classement au moment exact de l'action du joueur couplerait les modules entre eux et ralentirait chaque écriture.
- **Worker d'arrière-plan dédié** : rejeté car impossible à maintenir avec l'offre gratuite sans serveur.

## Réexamen

Cette décision devra être réexaminée si la fréquence des écritures devient tellement importante que le rattrapage synchrone à la lecture commence à ralentir sensiblement les temps de réponse des utilisateurs.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.