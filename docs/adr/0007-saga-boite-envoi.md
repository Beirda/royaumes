# ADR-0007 - Saga orchestrée et boîte d'envoi transactionnelle pour les opérations entre modules

- Statut : accepté
- Date : 2026-10-21

## Contexte

Le Marché permet aux joueurs de s'échanger des ressources issues de leurs villages respectifs.

Un échange touche plusieurs parties indépendantes : l'offre sur le marché, le village du vendeur (prélèvement puis versement) et le village de l'acheteur (prélèvement puis versement).

Pour préserver l'isolation des domaines du monolithe modulaire et permettre l'extraction future d'un module en service autonome (ADR 0001 et ADR 0009), aucun module ne doit écrire directement dans les tables ou le flux d'événements d'un autre module, ni ouvrir de transaction distribuée bloquante (2PC).

## Décision

Les opérations touchant plusieurs modules reposent sur une **Saga orchestrée**, appuyée par le motif de la **boîte d'envoi transactionnelle** (*Transactional Outbox*) :

- Le module Marché orchestre l'échange en plusieurs étapes nettes :
  1. Réservation : prélèvement et mise en séquestre des ressources du vendeur (étape compensable).
  2. Ouverture de l'offre sur le marché avec une échéance de validité.
  3. Acceptation : prélèvement des ressources de paiement de l'acheteur (étape pivot).
  4. Conclusion : livraison des ressources aux deux joueurs, ou compensation (restitution des ressources séquestrées au vendeur en cas de retrait, expiration ou refus).
- Chaque étape enregistre ses messages dans la boîte d'envoi (`platform.outbox`) au sein de la même transaction locale que les événements du module émetteur.
- Le distributeur (`createDispatcher`) dépile les messages et les transmet aux gestionnaires des modules destinataires (garantie de remise au moins une fois).
- L'idempotence des opérations est assurée par un identifiant de transfert unique (`transferId`), ce qui évite les doublons si un message est délivré plusieurs fois.
- Les messages en échec répété (lettres mortes) sont conservés dans la boîte d'envoi et peuvent être inspectés ou relancés via un script dédié (`scripts/dead-letters.ts`).

## Conséquences

### Positives

- Les modules restent strictement découplés : chaque transaction n'écrit que dans les données d'un seul module et dans la boîte d'envoi.
- Fiabilité face aux incidents : aucun échange ne peut disparaître en cas de redémarrage ou d'erreur temporaire ; le message reste dans la boîte d'envoi et sera rejoué.
- Prépare l'extraction d'un module en microservice, les messages pouvant transiter par HTTP sans modifier la logique de la saga.

### Négatives

- Cohérence éventuelle : l'échange n'est pas immédiat à la milliseconde près, et les ressources transitent par un état réservé.
- La logique métier est plus complexe à concevoir pour prévoir chaque cas d'échec et les compensations associées.
- Nécessité de surveiller les messages abandonnés en cas d'erreur de traitement bloquante.

## Alternatives écartées

- **Transaction SQL unique englobant le marché et les villages** : rejeté car cela briserait l'encapsulation, bloquerait des verrous sur plusieurs flux d'événements et empêcherait toute extraction du Village en service distant.
- **Saga chorégraphiée (sans chef d'orchestre)** : rejeté car l'état global de l'échange serait disséminé entre plusieurs modules, rendant le suivi et le débogage beaucoup plus difficiles.

## Réexamen

Cette décision pourra être réexaminée si d'autres fonctionnalités nécessitent des coordinations inter-modules complexes, afin d'extraire un moteur d'orchestration générique dans la plateforme.

## Usage de l'IA générative

Utilisée uniquement pour mettre la documentation au propre.