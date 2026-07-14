# Modèle de données

La phase 1 crée `profiles`, `categories` et `category_follows`, avec UUID, contraintes, index et RLS. Un trigger crée un profil `pending_onboarding` pour chaque identité Auth. La fonction transactionnelle `complete_onboarding` vérifie majorité, nom unique, département, activité, genre et au moins trois catégories actives avant d’activer le profil.

Les données démographiques sont lisibles uniquement par leur propriétaire. La vue `public_profiles` ne contient que l’identifiant, le nom d’utilisateur, le type de compte et la date de création. Les phases suivantes ajouteront séparément questions, options, séries, votes, interactions, commentaires et modération.

Les identifiants techniques de catégories seront des slugs stables, jamais des UUID codés en dur.

La taxonomie v1 ajoute `universes` et `category_tags`. Les 30 catégories appartiennent chacune à un des 7 univers; les univers n’ont aucun abonnement utilisateur. `tags` devient un catalogue contrôlé avec slug, sensibilité, activation et mise en avant. Un trigger refuse les tags hors catalogue et les associations question-tag non recommandées pour la catégorie.

La phase 2 ajoute `question_series`, `questions`, `question_options`, `tags`, `question_tags` et `question_duplicate_reviews`. Chaque question appartient à une série; une nouvelle vague crée une ligne distincte reliée à `previous_wave_id`, ce qui permettra des votes indépendants. `question_settings` centralise longueurs, quotas et seuils de similarité.

Les questions portent leur texte original et sa normalisation versionnée. Les options ont une position stable et sont uniques après normalisation dans une question. Les confirmations de similarité moyenne sont conservées séparément pour audit. `question_forbidden_terms` fournit une première liste serveur configurable; sa gestion administrative reste en phase 8.

La phase 3 ajoute `votes`, `question_follows` et `question_upvotes`. `votes` impose une unicité `(question_id, user_id)` et ne permet ni mise à jour ni suppression au client. Les votes restent la source de vérité; les compteurs de questions et d’options sont des projections atomiques destinées aux résultats et seront réconciliables ultérieurement. Chaque vague conserve ses propres options et votes.

La phase 4 ajoute `feed_impressions` et `interaction_events`, deux journaux privés et idempotents par UUID. Les impressions conservent le type de fil, la version de l’algorithme, le rang et le lot. Les événements d’affichage, passage et durée sont validés par une fonction dédiée; votes et suivis créent leurs événements depuis les mutations faisant autorité. `blocked_users` et `verified_account_follows` complètent les filtres de candidats, sans anticiper leurs interfaces des phases ultérieures.

La recommandation V1 ajoute `feed_sessions`, `feed_reservations` et `user_question_controls`. Les réservations bornées stabilisent les pages et conservent uniquement les composantes explicables du classement. `feed_impressions` reçoit ces composantes au moment de la visibilité réelle, jamais au préchargement. Ces trois tables restent privées et réservées au serveur.

La phase 5 n’ajoute aucune donnée produit. Elle ajoute le type d’ordre `discovery_mode`, des index plein texte français et trigrammes sur les champs recherchables, ainsi que les index temporels nécessaires au calcul des tendances. `discover_questions` retourne une projection sûre des questions éligibles avec catégorie, tags et identité publique de l’auteur; les compteurs et historiques individuels restent internes.

La phase 6 ajoute `comments` et `reports`. Un commentaire appartient directement à une question et ne possède volontairement aucun parent; son statut `visible | hidden | removed` permet une modération non destructive. Un signalement cible exactement une question ou un commentaire, conserve un motif contrôlé, un détail facultatif privé et un statut de traitement. Deux index uniques partiels empêchent un même membre de maintenir plusieurs signalements actifs sur la même cible.

La phase 7 ajoute `account_deletion_requests` et `account_lifecycle_audit`. La première matérialise la demande confirmée et son traitement; la seconde est append-only pour les rôles applicatifs. Le statut `anonymized` autorise un profil sans nom ni démographie, tout en conservant sa clé interne pour les votes et contenus historiques. Les suivis, soutiens et événements non nécessaires sont supprimés lors du traitement, avec décrément atomique de leurs compteurs projetés.

La phase 8 ajoute `moderation_cases`, `moderation_actions`, `audit_log` et `verified_profiles`. Un cas correspond à un signalement; chaque action conserve acteur, cible, justification et états JSON précédent/nouveau. `verified_profiles` sépare conceptuellement organisation/type/description publics de site, responsable et notes privés. `question_forbidden_terms` reçoit sévérité et créateur administratif.

La phase 10 ajoute `sponsor_organisations` et `sponsor_campaigns`. Une organisation possède un compte vérifié actif; une campagne porte une seule question, ses dates, statut, objectif et budget EUR. Aucun champ ne représente genre, âge, département, activité, réponse ou historique de cible. Les résultats sponsor sont calculés depuis les votes faisant autorité sans exposer leurs lignes.
