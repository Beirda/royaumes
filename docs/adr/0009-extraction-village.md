# ADR-0009 - Extraction du Village en service autonome, préparée mais non déployée

- Statut : accepté
- Date : 2026-10-23

## Contexte

L'ADR 0001 posait le choix d'un monolithe modulaire tout en exigeant qu'un module puisse être extrait sous la forme d'un service autonome si un besoin apparaissait.

Lors du TD11, l'extraction du Village (`realm`) a été réalisée pour vérifier l'étanchéité réelle des frontières architecturales.

Néanmoins, les conditions d'exploitation du projet restent les mêmes : une équipe d'une seule personne, un hébergement gratuit sans serveur sur Vercel Hobby et Neon Free, et un trafic modeste.

## Décision

L'extraction du Village en service autonome est entièrement conçue, codée et testable en local, mais **elle n'est pas déployée en production** :

- Le service Village autonome possède son propre serveur Hono (`src/services/village/village-service.ts`), sa propre base de données, son propre journal d'événements et sa propre boîte d'envoi.
- L'application principale communique avec lui par un adaptateur distant (`src/modules/realm/remote.ts`) appliquant le motif de l'étrangleur (*Strangler Fig*) : une passerelle HTTP transmet les requêtes des joueurs, et un relais recopie les événements publiés dans le journal local pour alimenter le Classement.
- En production sur Vercel, le Village reste exécuté directement dans le processus de l'application monolithe. La variante distante ne s'active que si les variables d'environnement `REALM_SERVICE_URL` et `SERVICE_SECRET` sont renseignées.

## Conséquences

### Positives

- La faisabilité technique de l'extraction est validée par le code et par les tests : les frontières entre modules sont bien étanches.
- Simplicité préservée en production : aucun surcoût d'hébergement, aucun risque de panne réseau entre services, et aucun morcellement des quotas gratuits de Vercel.
- Déploiement et surveillance conservés au sein d'une seule application sans serveur.

### Négatives

- Deux modes d'exécution coexistent pour le module Village (en processus et via l'adaptateur distant), ce qui demande de maintenir le code d'adaptation (`remote.ts`).
- Certaines dettes techniques identifiées lors de l'extraction (dettes DT-008, DT-009 et DT-010 concernant les migrations, la pagination du flux et la distribution de la boîte d'envoi du service) restent ouvertes tant que le service n'est pas déployé en production.

## Alternatives écartées

- **Déployer immédiatement le service extrait en production** : rejeté car cela ajouterait des points de défaillance réseau, de la latence entre services et consommerait inutilement deux projets Vercel sur l'offre gratuite sans aucun besoin de charge.
- **Se limiter à une extraction théorique dans la documentation** : rejeté car seule l'implémentation effective permet de débusquer les couplages invisibles entre modules.

## Réexamen

Cette décision devra être réexaminée si la charge sur le Village augmente au point d'exiger une mise à l'échelle indépendante, ou si plusieurs personnes doivent intervenir en parallèle sur ce domaine sans partager le cycle de déploiement du monolithe.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.