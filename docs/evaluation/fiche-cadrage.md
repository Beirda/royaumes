# Fiche de cadrage : Forge

- Auteur : Adrien
- Date : 2026-10-31
- Nom technique du module : `forge`
- Validée par l'enseignant le : 2026-10-31

## L'idée

La Forge permet au joueur de fabriquer des équipements et objets d'artisanat précieux (épée de fer, bouclier runique, plastron d'acier, pioche de maître, couronne royale) à partir de recettes en consommant les ressources produites par son village (bois, pierre, or).

Cette activité complète le cycle économique du jeu : les ressources accumulées dans le village peuvent être converties en objets confectionnés. Chaque confection mobilise une saga orchestrée avec le Village pour réserver les matières premières, applique une durée de confection (échéance gérée de façon paresseuse sans tâche de fond), permet l'annulation avec remboursement compensatoire intégral des ressources tant que l'objet n'est pas terminé, et alimente un modèle de lecture (inventaire et atelier du joueur) par une projection asynchrone du journal d'événements.

## Les règles métier

1. Une recette n'est fabricable que si elle appartient au catalogue officiel des recettes de la Forge (`sword`, `shield`, `armor`, `pickaxe`, `crown`).
2. Le lancement d'une fabrication réserve son coût en ressources (`wood`, `stone`, `gold`) auprès du Village via un message de prélèvement transactionnel.
3. Si le Village refuse le prélèvement pour ressources insuffisantes, la fabrication est rejetée et son état devient `rejected`.
4. Si le Village confirme le prélèvement, la fabrication entre dans l'état `in_progress` pour une durée déterminée par la recette (`readyAt = startedAt + durationMs`).
5. Tant qu'une fabrication est en cours (`in_progress`) ou en cours de réservation (`reserving`), son propriétaire peut l'annuler ; l'annulation déclenche le remboursement intégral des ressources prélevées par un message de versement au Village (`realm.deposit`).
6. Une fabrication ne peut être récupérée (`claim`) que si l'échéance de confection est atteinte (`clock() >= readyAt`) ; la récupération fait passer l'état à `completed` et ajoute définitivement l'objet à l'inventaire du joueur.
7. Une fabrication déjà terminée, rejetée ou annulée ne peut plus être ni annulée ni récupérée.
8. Un joueur ne peut consulter, annuler ou récupérer que ses propres fabrications.
9. Les messages de réponse du Village sont idempotents : une réponse reçue en double est ignorée sans produire d'événement ni de message supplémentaire.

## Les commandes et les lectures

| Action du joueur | Commande ou lecture | Route envisagée |
| --- | --- | --- |
| Consulter les recettes, l'atelier et l'inventaire | Lecture | `GET /api/forge` |
| Lancer la fabrication d'un objet | Commande | `POST /api/forge/crafts` |
| Consulter le détail d'une fabrication | Lecture | `GET /api/forge/crafts/:id` |
| Annuler une fabrication en cours (remboursement) | Commande | `POST /api/forge/crafts/:id/cancel` |
| Récupérer un objet forgé achevé | Commande | `POST /api/forge/crafts/:id/claim` |

## Le stockage envisagé

Le cycle de vie de chaque fabrication est géré par le journal d'événements de la plateforme (`platform.events`) selon le modèle Decider, assurant la traçabilité complète de chaque étape et la gestion de la concurrence optimiste (`withOptimisticRetry`).
L'état actuel de l'atelier et l'inventaire du joueur sont tenus par une projection dans une table relationnelle classique `forge.crafts` située dans son propre schéma PostgreSQL `forge`. Cette table constitue un modèle de lecture reconstruit et mis à jour lors de la consultation.

## La communication avec les modules existants

La communication s'effectue avec le module Village (`realm`) au travers de la boîte d'envoi transactionnelle (`platform.outbox`) :
- Émission du message `realm.withdraw` vers le Village avec l'identifiant de transfert `forge-${craftId}-reserve` et le sujet de retour `forge.transfer-result`.
- Traitement de la réponse du Village sur le sujet `forge.transfer-result` : passage à `in_progress` en cas de succès (`withdrawn`) ou à `rejected` en cas de refus (`refused`).
- En cas d'annulation demandée par le joueur, émission compensable d'un message `realm.deposit` avec l'identifiant `forge-${craftId}-refund` pour restituer les ressources au village du joueur.

## Les données personnelles

Le nom et l'identifiant du joueur sont associés à ses fabrications et objets. Le module implémente le port `personal-data.ts` permettant l'export au format JSON de toutes les fabrications et objets du joueur (`GET /api/account/export`), l'anonymisation du nom (`ERASED_NAME`) dans les événements du journal et la mise à jour correspondante dans la table `forge.crafts` lors de la suppression de compte.

## Les bonus visés

1. **B5 (+2)** : Une saga avec au moins une étape compensable, entre la Forge et le Village (restitution intégrale des ressources en cas d'annulation d'une commande).
2. **B4 (+1)** : Un modèle de lecture tenu par une projection (`forge-crafts`), doté de son point de reprise et de sa version.
3. **B1 (+1)** : Un canal temps réel propre au module (`forge`), discret (`redact: true`) avec règle d'accès vérifiant l'authentification.
4. **B2 (+1)** : Une échéance de fabrication gérée sans tâche de fond (échéance paresseuse validée lors de la consultation et de la commande `claim`).
5. **B8 (+1)** : Une nouvelle fonction d'aptitude protégeant les règles architecturales de la Forge (schéma PostgreSQL isolé et intégrité immuable des recettes).

