# ADR-0005 - Intelligence artificielle déterministe, sans tâche de fond

- Statut : accepté
- Date : 2026-10-21

## Contexte

Les expéditions du Donjon peuvent accueillir des compagnons non-joueurs pour permettre à un joueur d'explorer seul ou en effectif réduit. De plus, les monstres doivent attaquer avec une tactique adaptée au niveau de difficulté choisi (facile ou difficile).

Avec l'Event Sourcing, l'état d'une partie doit pouvoir être reconstruit de manière parfaitement identique en rejouant ses événements. Tout aléa ou décision doit donc être reproductible et vérifiable.

Enfin, l'hébergement sans serveur exclut de faire tourner des processus autonomes simulant la réflexion continue d'un agent en tâche de fond.

## Décision

L'intelligence artificielle est déterministe, synchrone et sans tâche de fond :

- Les décisions du compagnon et le comportement des monstres sont portés par des fonctions pures appelées uniquement au moment de la résolution d'une manche (`settle` / `resolveRound`).
- Le compagnon n'a pas de temps de réflexion asynchrone : au moment de résoudre la manche, il analyse l'état des héros et des monstres selon des règles simples (soigner en priorité le héros le plus mal en point sous un seuil de santé, ou à défaut attaquer le monstre le plus faible).
- Les monstres appliquent la stratégie de leur niveau : en mode facile, ils attaquent un héros tiré au sort ; en mode difficile, ils concentrent leurs coups sur les héros achevables ou qui ne se défendent pas.
- Tout tirage au sort s'appuie sur un générateur pseudo-aléatoire à graine (`seeded`), alimenté par la graine de l'expédition et le numéro de la manche.
- Toutes les actions choisies et leurs résultats sont enregistrés directement dans l'événement `RoundResolved` : lors d'un rejeu ultérieur, aucune décision d'IA n'a besoin d'être recalculée.

## Conséquences

### Positives

- Zéro consommation de ressources en dehors des requêtes : aucun processus ni tâche en tâche de fond.
- Déterminisme absolu : la relecture de l'historique produit toujours le même résultat.
- Aucun coût ni latence liés à un service d'IA externe ou à un modèle de langage distant.
- Tests unitaires simples et rapides avec des scénarios prédéterminés.

### Négatives

- Les comportements sont simples et peuvent devenir prévisibles pour les joueurs expérimentés.
- Le compagnon réagit immédiatement lors de la résolution de manche, sans simuler d'hésitation humaine.

## Alternatives écartées

- **Modèles de langage (LLM)** : rejetés en raison de la latence (plusieurs secondes d'attente), des coûts d'appel, du non-déterminisme et du risque d'erreurs sur les règles du jeu.
- **Bot externe envoyant des requêtes HTTP** : rejeté car complexe à héberger et inutilement consommateur de bande passante et de quotas.
- **Tirages non reproductibles (`Math.random()`)** : rejetés car ils empêcheraient de rejouer fidèlement une expédition pour déboguer un incident.

## Réexamen

Cette décision pourra être réexaminée si de nouveaux modes de jeu requièrent des arbres de recherche tactiques plus poussés ou des profils de jeu plus variés pour les compagnons.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.