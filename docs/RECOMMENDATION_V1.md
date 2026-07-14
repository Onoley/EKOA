# Recommandation du fil — V1

## Architecture

Le moteur actif est centralisé dans `src/lib/recommendation`. L’API authentifiée crée une session stable, lit d’abord les réservations existantes, puis génère au plus 300 candidats si un nouveau bloc est nécessaire. Le pipeline est : `generateCandidates`, `filterEligibleCandidates`, `computeUserAffinity`, `computeQuestionScore`, exploration déterministe, `rerankWithSessionConstraints`, `reserveFeedItems`, puis `recordRankingDecision`.

PostgreSQL applique les exclusions de sécurité et constitue six pools : intérêts explicites, intérêts appris, sujets voisins, exploration, éditorial global et sponsorisé. TypeScript calcule un score explicable et construit une séquence diversifiée. Un bloc de 15 questions est réservé; l’API en livre cinq par page avec un curseur `{ sessionId, offset, snapshot }`.

## Éligibilité

Sont exclus avant scoring : questions non publiées ou modérées, votes antérieurs, contrôle utilisateur masqué/archivé, signalement actif du demandeur, auteur bloqué, âge incompatible, question déjà réservée dans la session et campagne liée inactive ou hors dates. Le fil « Suivis » exige en plus une catégorie ou un compte vérifié suivi. Une défense pure TypeScript répète les exclusions disponibles.

Une impression antérieure de moins de 24 h entraîne une pénalité de 30 points; entre 1 et 7 jours, 8 points. Une question votée reste exclue. Une réservation ou un préchargement ne crée jamais une impression.

## Affinité et neutralité

Le profil est calculé à la demande sur au plus 1 000 événements des 90 derniers jours et les catégories suivies. Poids : suivi `+1 catégorie/+0,20 univers`; vote `+0,05/+0,02 tag/+0,01 format`; upvote `+0,20/+0,10/+0,05`; commentaire `+0,35/+0,15/+0,08`; passage sous 1 500 ms `-0,08/-0,03`. Les poids sont bornés entre -2 et +3 et décroissent par `poids × exp(-jours/90)`.

Le choix de réponse n’est jamais lu : seul le fait d’avoir voté compte. Un signalement exclut la question mais ne diminue aucune catégorie. Genre, département, activité, réponse, religion, santé ou opinion ne participent pas au score. L’âge sert uniquement à l’éligibilité. Aucun de ces signaux ne participe au sponsoring.

## Score sur 100

- affinité : 30 points (`50 % catégorie + 30 % tags + 10 % univers + 10 % format`, bonus explicite borné) ;
- qualité éditoriale : 20 points ;
- performance lissée : 15 points ;
- nouveauté : 10 points ;
- exploration/incertitude : 10 points ;
- fraîcheur : 10 points ;
- priorité éditoriale : 5 points.

Les taux utilisent `(succès + moyenneGlobale × 50) / (impressions + 50)`. La performance combine vote, upvote et commentaire, avec pénalité de passage rapide. Un taux de signalement supérieur à 1 % retire 8 points et supérieur à 3 % retire 20 points. Les statistiques absentes utilisent les moyennes globales.

## Diversité et exploration

Le re-ranking glouton évite : deux catégories consécutives, plus de deux questions du même univers sur cinq, plus de deux questions très sensibles sur cinq, trois formats consécutifs et un tag répété immédiatement. Une position de découverte est recherchée toutes les six questions. Les catégories politiques sont espacées dans le début de session. Les univers culture/divertissement et mode de vie servent de respiration légère.

Une sponsorisée est interdite dans les trois premières positions, espacée d’au moins huit positions et jamais consécutive. La contrainte consécutive n’est jamais relaxée. Ordre de relaxation : tag, format, univers, sensibilité, politique précoce, découverte, minimum de trois univers, catégorie, intervalle sponsor, début sponsor. Les exclusions de sécurité ne sont jamais relaxées.

## Sessions, traçabilité et événements

`feed_sessions` porte la version `v1`, la variante et une expiration de six heures. `feed_reservations` garantit l’unicité de question et de position, conserve pool, score, composantes et contraintes, et se renouvelle pendant la session. Les appels concurrents sont sérialisés par verrou de session.

Le composant existant enregistre l’impression uniquement à 60 % de visibilité. Un trigger rattache alors la réservation à `feed_impressions`; le préchargement ne laisse donc aucune décision « montrée ». Les événements autoritatifs existants couvrent vote, upvote, commentaire et suivi. Un passage rapide est dérivé de `skip` et `dwell < 1 500 ms`, sans événement client redondant.

Le mode `?debug=1` retourne candidats exclus et sélection uniquement hors production. Aucun détail n’est affiché dans l’interface normale.

## Limites V1

Les masquages/archives disposent du stockage et des filtres mais aucune nouvelle commande visuelle n’est ajoutée dans cette phase. Partage et vue explicite des résultats ne sont pas instrumentés faute d’événement fiable existant. Les affinités sont calculées sur une fenêtre bornée plutôt que matérialisées; une V2 pourra les maintenir incrémentalement. Les relations entre catégories utilisent l’univers commun, sans embeddings ni inférence idéologique.
