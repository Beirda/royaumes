# ADR-0010 - Architecture du module Forge

- Statut : accepté
- Date : 2026-10-31

## Contexte

La Forge permet aux joueurs de fabriquer des armes, armures et outils en utilisant les ressources de leur village (bois, pierre, or).

Pour concevoir ce module, nous devions résoudre deux problèmes concrets :

1. **Gérer les commandes d'objets** : fabriquer une arme prend du temps et passe par plusieurs étapes (réservation des ressources, fabrication en cours, récupération ou annulation avec remboursement). Il fallait un historique clair pour ne perdre aucune action, tout en permettant au joueur d'afficher son inventaire instantanément.
2. **Échanger des ressources avec le Village sans tout bloquer** : la Forge a besoin des ressources du Village, mais le Village est un module indépendant. Selon nos règles d'architecture, un module ne doit jamais écrire directement dans la base d'un autre module, ni bloquer l'application avec des transactions lourdes.

## Décision

Nous avons fait deux choix simples et éprouvés :

### 1. Stockage : les faits d'abord, une table rapide pour l'affichage (CQRS)
- **Côté écriture** : chaque étape d'une fabrication est enregistrée sous forme d'événement (`CraftStarted`, `CraftInProgress`, `CraftCancelled`, etc.) dans le journal de la plateforme. Cela nous offre un suivi infalsifiable et évite les conflits quand deux actions arrivent en même temps.
- **Côté lecture** : pour que l'écran de la Forge s'affiche vite sans recalculer tout le passé, une table dédiée (`forge.crafts`) garde l'état actuel des commandes et des objets du joueur. Elle est mise à jour automatiquement par une projection.

### 2. Communication : une saga avec remboursement automatique
Pour commander des ressources au Village en toute sécurité, la Forge utilise une saga asynchrone :
- Quand le joueur lance une confection, la Forge dépose un message de retrait dans sa boîte d'envoi (`outbox`).
- Si le Village a assez de ressources, la fabrication démarre. S'il n'en a pas assez, elle est refusée proprement.
- **Annulation et remboursement** : tant que l'objet n'est pas terminé, le joueur peut annuler sa commande. La Forge renvoie alors automatiquement les ressources au Village du joueur par un message de dépôt.

### 3. Durabilité et utilité des objets
- Les équipements de combat (épées, boucliers, armures) augmentent l'attaque, la défense et les PV du héros pour 2 expéditions dans le Donjon.
- Les outils de récolte (pioches, haches) augmentent la production du Village pendant 15 minutes.

## Ce que cela nous apporte

### Les points positifs
- **Fiabilité** : aucun risque de perdre des ressources en cas de panne ou de coupure réseau, la boîte d'envoi rejoue les messages si besoin.
- **Droit à l'erreur pour le joueur** : le joueur peut changer d'avis et récupérer ses ressources avant la fin de la forge.
- **Affichage rapide** : l'inventaire et les confections se lisent en une seule requête SQL simple.
- **Modules bien séparés** : la Forge et le Village restent indépendants et s'échangent des messages sans se mélanger.

### Les compromis acceptés
- Quelques millisecondes de délai le temps que les messages soient distribués entre les modules.
- Un peu plus de code à écrire qu'un simple appel direct de fonction, mais bien plus robuste.

## Les pistes écartées

- **Appel de fonction direct entre la Forge et le Village** : trop risqué, car cela lierait les deux modules et rendrait impossible une panne propre ou une séparation future.
- **Base de données classique sans événements** : sans journal d'événements, il serait très dur de tracer les remboursements et d'éviter les incohérences si le joueur clique plusieurs fois en même temps.

## Réexamen

Si le nombre de fabrications explose, nous pourrons archiver les confections très anciennes pour garder une table de lecture légère.

## Usage de l'IA générative

Utilisation pour la complétion automatique de code, la correction des bugs et mise en forme de la doc.
