# ADR-0003 - Server-Sent Events, alimentés par le journal, pour le temps réel

- Statut : accepté
- Date : 2026-10-20

## Contexte

Les joueurs doivent être informés des changements en direct : la production de ressources dans leur village, les actions de leurs coéquipiers dans le donjon ou les évolutions du classement.

L'application est déployée sur l'infrastructure sans serveur de Vercel. Les fonctions ont une durée d'exécution limitée, ne partagent aucune mémoire entre elles et ne permettent pas de maintenir un serveur d'état permanent pour gérer des connexions WebSocket bidirectionnelles.

Par ailleurs, toutes les actions du jeu sont déjà enregistrées de façon ordonnée dans le journal d'événements PostgreSQL de la plateforme (`platform.events`).

## Décision

La diffusion temps réel repose sur les Server-Sent Events (SSE), directement alimentés par la lecture du journal d'événements :

- Le navigateur ouvre une connexion HTTP en écoute sur `/api/stream/:channel`, servie par Hono (`streamSSE`).
- Le serveur ne conserve aucun état en mémoire : il interroge régulièrement le journal (`pollMs = 500 ms`) et transmet chaque nouvel événement au client. N'importe quelle instance sans serveur peut ainsi répondre à n'importe quel joueur.
- La reconnexion est prise en charge nativement par le navigateur grâce à l'en-tête `Last-Event-ID`, qui transmet la dernière position ou version reçue pour reprendre le flux exactement là où il s'était arrêté.
- Pour respecter les plafonds d'exécution sans serveur, la connexion se termine volontairement au bout de 4 minutes (`maxStreamMs = 240 000 ms`), ce qui incite le navigateur à se reconnecter aussitôt sans interruption visible. Un signe de vie régulier (`: ping`) évite la fermeture par les intermédiaires réseau.
- L'accès aux canaux est filtré par des règles (`ChannelPolicy`). Sur un canal discret (comme celui d'une expédition de donjon), les données sensibles sont retirées (`redact`) pour ne pas dévoiler les choix secrets ou le contenu des futures salles.
- Une route de repli HTTP classique (`GET /api/stream/:channel/events`) reste disponible pour interroger les événements par lot.

## Conséquences

### Positives

- Fonctionne sur l'infrastructure sans serveur existante sans ajouter de serveur permanent ni de service externe payant.
- Protocole HTTP standard, unidirectionnel et léger, géré automatiquement par l'API `EventSource` des navigateurs.
- Réutilise le journal d'événements comme source unique de vérité, sans double publication.
- Contrôle d'accès homogène, fondé sur la session du joueur déjà vérifiée par l'application.

### Négatives

- La communication est strictement descendante : les actions du joueur continuent de passer par des requêtes POST indépendantes.
- Chaque connexion active interroge la base de données toutes les 500 ms, ce qui augmente le nombre de requêtes SQL sur PostgreSQL.
- Les connexions sont fermées et rouvertes toutes les 4 minutes pour rester dans les limites du sans-serveur.

## Alternatives écartées

- **WebSockets** : nécessite un processus serveur continuellement actif ou un service tiers géré (comme Pusher), incompatible avec l'offre gratuite sans serveur.
- **Sondage périodique par le client (polling classique)** : obligerait le client à envoyer des requêtes complètes à répétition, augmentant la latence ressentie et le volume d'en-têtes réseau échangés.

## Réexamen

Cette décision devra être réexaminée si le nombre de joueurs connectés en même temps s'accroît au point de saturer le pool de connexions de la base PostgreSQL en raison des lectures répétées du journal.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.