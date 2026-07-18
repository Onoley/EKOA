# Décisions d’architecture

## ADR-001 — Monolithe modulaire

Next.js et Supabase couvrent le MVP. Aucun service backend séparé n’est créé sans besoin démontré.

## ADR-002 — pnpm et Node.js 22

Le dépôt déclare pnpm 11.12.0 et Node.js 22 minimum afin de rendre l’outillage reproductible.

## ADR-003 — Français dans l’interface

Toute copie visible et tout message utilisateur sont en français. Le code et la documentation technique peuvent utiliser des identifiants anglais.

## ADR-004 — Confidentialité par défaut

Les données démographiques et votes ne sont jamais rendus publics. L’autorisation serveur ne remplace pas RLS et inversement.

## ADR-005 — Livraison incrémentale

Une seule phase est implémentée et vérifiée à la fois. La phase 0 ne contient aucune simulation de fonctionnalité produit.

## ADR-006 — Authentification sans mot de passe

La première version utilise les liens magiques Supabase et des cookies SSR. OAuth et mots de passe sont différés.

## ADR-007 — Onboarding transactionnel

La validation Zod améliore les erreurs utilisateur, mais la fonction SQL `complete_onboarding` répète les invariants et applique profil et catégories dans une seule transaction.

## ADR-008 — Doublons sans service sémantique (remplacée)

Cette décision historique est remplacée par ADR-033. La publication n'est plus bloquée ni retardée par une détection de doublon ou de similarité.

## ADR-009 — Publication transactionnelle (remplacée)

Cette décision historique est remplacée par ADR-033. Les quotas produit, l'analyse de contenu et les contrôles de similarité ne font plus partie des conditions de publication.

## ADR-010 — Résultats après participation

Les compteurs ne sont jamais lisibles directement. `get_question_results` vérifie le vote du demandeur avant de retourner les agrégats, sa réponse sélectionnée et l’état de ses interactions.

## ADR-011 — Vote immuable et idempotent

Une contrainte unique et un verrou transactionnel garantissent un seul vote par utilisateur et question. Répéter la même option retourne les résultats sans recompter; choisir ensuite une autre option est refusé.

## ADR-012 — Classement serveur hybride et versionné

PostgreSQL filtre les candidats éligibles dans une fonction accessible uniquement au service serveur. TypeScript calcule ensuite un score déterministe, explicable et testé, puis diversifie la séquence. Le curseur fixe un instantané et la version de l’algorithme; aucune métrique privée de classement ne rejoint le navigateur.

## ADR-013 — Télémétrie sans valeur d’autorisation

Les identifiants et interactions métier restent les seules sources de vérité. Le client peut seulement signaler impression, passage et durée avec une enveloppe stricte; les réponses et suivis sont journalisés par les mutations ou triggers ayant déjà réussi.

## ADR-014 — Recherche PostgreSQL avant moteur externe

Le catalogue initial ne justifie pas un service de recherche séparé. PostgreSQL associe dictionnaire français, trigrammes et index ciblés. La fonction serveur renvoie une projection minimale et centralise l’éligibilité; une migration vers un moteur externe ne sera envisagée qu’après mesures sur un volume représentatif.

## ADR-015 — Tendance fondée sur des actions communautaires

Le score sur sept jours utilise seulement votes, soutiens et suivis validés, avec décroissance par ancienneté. Les impressions, passages, durées et signalements ne peuvent pas rendre une question plus ou moins tendance.

## ADR-016 — Commentaires plats après participation

Un commentaire référence uniquement sa question. L’absence de parent empêche structurellement les fils imbriqués. Seuls les répondants peuvent publier, afin de conserver la discussion après expression d’une opinion et de ne pas rendre les commentaires nécessaires au vote.

## ADR-017 — Signalements polymorphes contraints

Une contrainte garantit exactement une cible question ou commentaire. Les raisons sont une enum stable, les doublons actifs sont bloqués par index et les transitions de traitement sont différées à l’administration de modération de la Phase 8.

## ADR-018 — Profil public par projection

Les pages publiques ne lisent jamais la ligne privée d’un tiers. Une fonction retourne uniquement identifiant, nom, type, ancienneté et état de suivi; une seconde applique l’éligibilité aux questions publiées.

## ADR-019 — Anonymisation plutôt que suppression en cascade

La suppression dure de `auth.users` déclencherait les cascades et détruirait des votes nécessaires aux agrégats. Le traitement utilise donc la suppression douce Auth, retire les attributs identifiants du profil applicatif et conserve une clé interne non publique pour l’intégrité historique.

## ADR-020 — Aucun délai de rétention inventé

Le workflow demande, audit et traitement est implémenté, mais aucune tâche planifiée n’est activée avant validation juridique des délais de conservation. Le traitement serveur est explicite et idempotent au niveau de la demande.

## ADR-021 — Autorisations de modération relues en base

Les layouts améliorent l’expérience mais ne constituent pas une frontière suffisante. Chaque fonction sensible vérifie le rôle actuel dans `profiles`, ce qui rend une révocation effective dès la requête suivante.

## ADR-022 — Modération réversible et atomique

Questions et commentaires changent de statut sans suppression. État précédent, nouvel état, justification, acteur et cible sont enregistrés dans la transaction qui applique la décision, y compris lors d’une restauration.

## ADR-023 — Vérification publique/privée sans lecture de table

`verified_profiles` n’est jamais accordée directement aux clients. Une projection publique minimale alimente les profils; la fonction administrative complète exige le rôle admin.

## ADR-024 — Limitation transactionnelle pseudonyme

Les limites critiques sont comptées en PostgreSQL pour résister aux requêtes concurrentes. Le serveur envoie un hachage SHA-256 contextualisé, jamais l’identifiant brut; une panne ferme la mutation sensible.

## ADR-025 — Observabilité à schéma fermé

Les événements opérationnels n’acceptent qu’un nom et quelques mesures non sensibles typées. Les charges utiles sont exclues par construction; le webhook reste optionnel.

## ADR-026 — Agréger avant rétention

La maintenance conserve des métriques journalières sans identité avant purge des événements détaillés. Le défaut de 90 jours reste configurable et soumis à validation juridique avant production.

## ADR-027 — Sponsoring sans ciblage individuel

Une campagne choisit une question entière et ne comporte aucune audience démographique, comportementale ou liée aux réponses. La catégorie `politique` est bloquée en base; aucun type de campagne politique n’existe.

## ADR-028 — Rapports sponsor seuilés

Le propriétaire vérifié consulte uniquement les comptes et pourcentages globaux par option. Sous 20 réponses, toutes les options sont supprimées. Les votes, identités, e-mails et profils ne font partie d’aucune projection sponsor.

## ADR-029 — Taxonomie canonique versionnée

Univers, catégories, tags et recommandations vivent dans une source versionnée unique. Leurs UUID sont déterministes et le seed est idempotent. Les tags sont contrôlés en base et leur sensibilité ne peut servir au profilage.

## ADR-030 — Remise à zéro éditoriale sans identité

La remise à zéro supprime les contenus et interactions dans une transaction avec assertions sur le nombre d’identités, profils et rôles. Auth, profils, vérifications et organisations restent hors du périmètre. Un dump contrôlé constitue le seul retour arrière après validation.

## ADR-031 — Import éditorial idempotent et atomique par question

`external_id` et un hash canonique distinguent répétition identique, conflit de contenu et doublon textuel. La validation complète précède toute écriture. Chaque question, sa série, ses options et ses tags sont insérés dans une fonction PostgreSQL atomique réservée au rôle serveur; un échec arrête les lots suivants et produit un rapport partiel.

## ADR-032 — Format, temporalité et statut de ligne restent distincts

La colonne Excel historique `editorial_type` alimente `question_format` (`opinion`, `projection`, `regulation`, `comportement`, `dilemme`). `editorial_type` conserve son sens de temporalité et vaut `evergreen` par défaut. Le statut de ligne `ready/review/rejected` est converti explicitement en `published/draft/ignoré`, sans étendre l’enum métier.

## ADR-033 — Publication ouverte et modération communautaire a posteriori

Tout membre actif publie immédiatement une question dès que sa structure et ses références à la taxonomie canonique sont valides. Aucune analyse automatisée du contenu, détection de doublon ou de similarité, ni aucun quota produit ne bloque ou ne retarde la publication. Cette décision remplace ADR-008 et ADR-009.

Une question reste publique tant qu'un administrateur n'agit pas explicitement. Les signalements seuls ne modifient ni son statut ni sa visibilité. La file d'administration regroupe les signalements par question et n'affiche un groupe qu'à partir de trois signalements actifs provenant de trois membres distincts. Une décision porte sur la question et résout atomiquement tout le groupe de signalements actifs associé.

Le nombre de signalements n'entre dans aucun score de classement, de recherche ou de tendance. Dans cette première version, les commentaires conservent leur traitement existant signalement par signalement; l'absence de regroupement et de seuil pour ces derniers est une limitation connue.

## ADR-034 — Masquage automatique au-delà de 10 signalements actifs

ADR-033 réserve tout changement de statut ou de visibilité à une décision explicite d'administrateur. Cette décision introduit une unique exception bornée : une question publiée passe automatiquement en `limited` (déjà invisible du public, visible de son auteur et des administrateurs) dès qu'elle atteint 10 signalements actifs provenant de 10 membres distincts — un seuil délibérément supérieur au seuil de 3 qui ne fait que regrouper une question dans la file d'administration. `submit_report` applique ce seuil directement, sans nouvelle table ni colonne.

Une question qu'un administrateur a explicitement validée (`moderation_status = 'approved'`, via l'action de restauration de `moderate_report`) est exemptée : les signalements restent possibles mais ne redéclenchent plus jamais le masquage automatique. Le nombre de signalements continue de n'entrer dans aucun score de classement, de recherche ou de tendance, conformément à ADR-033.
