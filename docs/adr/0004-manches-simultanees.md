# ADR-0004 - Manches simultanées et échéances paresseuses pour le Donjon

- Statut : accepté
- Date : 2026-10-20

## Contexte

Le Donjon propose des expéditions coopératives pouvant réunir jusqu'à quatre héros.

Dans un jeu multijoueur au tour par tour classique, chaque joueur attend son tour. Si un joueur tarde à répondre ou quitte sa partie, toute l'équipe se retrouve bloquée indéfiniment.

De plus, l'architecture sans serveur de Vercel n'offre aucun minuteur ni tâche d'arrière-plan continue capable de surveiller les secondes qui s'écoulent pour déclencher automatiquement des actions de jeu.

## Décision

La progression des expéditions et des combats repose sur des manches simultanées et des échéances calculées de manière paresseuse :

- **Manches simultanées** : en combat, tous les héros encore debout choisissent leur action en parallèle pendant une durée limitée (`ROUND_MS` = 15 s). L'action choisie reste masquée aux autres participants jusqu'au dénouement. La manche est résolue dès que tous les héros ont choisi ou dès que le temps est écoulé.
- **Échéances paresseuses (*lazy deadlines*)** : aucun minuteur serveur ne tourne en fond. La date limite (`deadline`) est inscrite dans l'événement qui ouvre la manche ou la salle suivante.
- À chaque nouvelle commande envoyée ou lors d'une simple vérification (`CheckDeadline`), la fonction pure `settle(state, now)` résout l'ensemble des échéances passées, calculées à la date exacte de leur terme sans dépendre du moment précis de l'appel.
- Si un joueur n'a pas validé son choix avant l'échéance, une action par défaut est appliquée. Si le héros dont c'est le tour d'ouvrir une porte en phase d'exploration est inactif au-delà du délai prévu (`EXPLORE_MS`), la porte est ouverte automatiquement pour faire avancer le groupe.

## Conséquences

### Positives

- Une partie n'est jamais bloquée par l'absence, l'hésitation ou la déconnexion d'un joueur.
- Aucune tâche de fond requise : le fonctionnement s'accorde parfaitement avec l'hébergement sans serveur.
- Le rythme de jeu est beaucoup plus vif et engageant qu'une attente séquentielle entre quatre joueurs.
- Comportement déterministe et reproductible lors du rejeu des événements.

### Négatives

- Si tous les joueurs quittent la page en même temps, le combat ne se résout pas de lui-même tant qu'aucun client ne consulte ou ne relance l'expédition.
- Les actions simultanées des joueurs sur une même manche augmentent le risque de conflits de concurrence optimiste, traités par des réessais automatiques (`withOptimisticRetry`).

## Alternatives écartées

- **Tour par tour séquentiel (héros par héros)** : rejeté car beaucoup trop lent à quatre joueurs et vulnérable aux abandons de partie.
- **Boucle de jeu permanente ou tâches planifiées à la seconde** : rejeté car irréalisable sur Vercel sans infrastructure dédiée payante.

## Réexamen

Cette décision pourra être réexaminée si le jeu évolue vers des combats tactiques en temps réel continu nécessitant un rafraîchissement physique ou un moteur de jeu temps réel.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.