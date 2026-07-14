# Architecture

Ekoa est un monolithe modulaire Next.js App Router déployable sur Vercel. PostgreSQL, Auth et RLS seront fournis par Supabase. Les Server Components servent les lectures initiales; Server Actions et Route Handlers portent les mutations et interfaces HTTP. Zod valide chaque frontière.

Les modules produit seront regroupés par fonctionnalité dans `src/features`. Les composants partagés resteront petits; l’infrastructure commune vit dans `src/lib`. Les migrations SQL de `supabase/migrations` seront l’unique source de vérité du schéma.

La source éditoriale de taxonomie est `taxonomy/catalog.mjs`. La migration générée installe son schéma et ses données de référence; les commandes `taxonomy:seed` et `taxonomy:check` assurent respectivement une synchronisation idempotente et le contrôle des invariants.

L’autorisation applicative serveur et les politiques RLS formeront deux barrières indépendantes. Le client service-role restera limité aux modules `server-only` explicitement justifiés.

La session Supabase repose sur des cookies SSR rafraîchis par `src/proxy.ts`. Les layouts protégés relisent les claims et le profil courant avant de distinguer compte actif, onboarding incomplet et compte indisponible. L’onboarding est validé par Zod, puis finalisé atomiquement par la fonction SQL `complete_onboarding`.

La création de questions suit la même défense en profondeur : Zod produit des erreurs françaises côté serveur, puis `save_question_draft` répète les invariants et remplace atomiquement options et tags. `publish_question` verrouille l’auteur et le texte normalisé avant de recalculer quotas et similarités. Le navigateur ne dispose d’aucun droit d’écriture direct sur les tables de questions.

Le vote utilise `submit_vote`, qui verrouille le couple utilisateur/question, vérifie statut, modération, ciblage d’âge et appartenance de l’option, puis écrit le vote et incrémente les compteurs dans une transaction. `get_question_results` ne renvoie des agrégats qu’après avoir retrouvé le vote du demandeur. Les suivis et soutiens utilisent des mutations idempotentes distinctes; le soutien exige un vote.

Le fil utilise un pipeline en deux temps. Une fonction PostgreSQL réservée au serveur sélectionne au plus 100 questions éligibles (statut, modération, âge, vote, blocage et source du fil). Un module TypeScript pur calcule ensuite le score versionné avec lissage bayésien, affinité, fraîcheur, exploration reproductible et pénalités, puis diversifie auteurs et catégories. Le curseur opaque transporte version, instantané, identifiants déjà vus et historique récent pour éviter les répétitions entre pages. Les objectifs à mesurer sur un jeu représentatif local sont moins de 150 ms pour la sélection SQL p95 et moins de 20 ms pour classement/diversification de 100 candidats; aucune mesure de production n’est revendiquée à ce stade.

Explorer reste un Server Component authentifié. Il appelle une fonction de découverte réservée au service serveur, qui applique les mêmes filtres de statut, modération, âge et blocage avant toute recherche. PostgreSQL combine recherche plein texte française et similarité trigramme sur questions, tags, catégories et noms vérifiés. Les curseurs opaques fixent requête, filtre, ordre, instantané et position afin qu’un curseur ne puisse pas être réutilisé pour une autre recherche.

« Tendances » couvre une fenêtre glissante de sept jours. Son score utilise votes, soutiens et suivis issus des tables faisant autorité, atténue l’ancienneté et pénalise fortement les signalements cumulés. Il ne dépend ni des événements analytiques ni du temps passé. « Questions récentes » conserve un ordre stable par publication puis UUID.

Les commentaires ne font pas partie des réponses du fil. La page de détail les charge par une route dédiée et un curseur `(created_at, id)`. `create_comment` exige un vote faisant autorité, répète les contrôles de disponibilité et filtre longueur, coordonnées, liens et termes interdits dans la même transaction que l’écriture.

Les signalements utilisent une cible typée et une taxonomie PostgreSQL finie. `submit_report` vérifie la visibilité de la cible, déduplique les signalements encore actifs sous contrainte unique et n’incrémente le compteur d’une question qu’après une création effective. Les événements analytiques `comment` et `report` sont produits seulement après la mutation métier réussie.

Le profil public passe par des fonctions à projection minimale; aucune lecture de la ligne privée `profiles` d’un tiers n’est nécessaire. Le suivi d’un compte revalide transactionnellement que la cible est active et vérifiée. Les réglages privés répètent majorité, département et valeurs contrôlées dans Zod puis PostgreSQL.

Une demande de suppression confirmée place immédiatement le compte en `deletion_requested`, bloque toutes les mutations produit et ajoute une trace de cycle de vie. Le traitement serveur exécute d’abord `anonymize_requested_account`, qui est rejouable, puis demande la suppression douce de l’identité Supabase Auth. Questions, commentaires et votes restent reliés à un profil interne sans identité publique afin de préserver contenu et agrégats. Le déclenchement automatique attend une durée de conservation validée juridiquement; la fonction de traitement est prête pour une opération serveur contrôlée.

L’espace `/admin` possède son propre layout protégé. `requireModerator` constitue la première barrière applicative; chaque fonction SQL relit ensuite rôle et statut dans `profiles`. Les modérateurs peuvent traiter ou restaurer les contenus signalés. Les suspensions, vérifications et termes interdits exigent `admin`.

Une décision de modération verrouille le signalement et la cible, capture les états précédent et nouveau, met à jour contenu/cas/signalement puis écrit `moderation_actions` et `audit_log` dans la même transaction. Aucune interface n’effectue de suppression physique. Les profils vérifiés stockent champs publics et privés ensemble mais aucune lecture directe n’est accordée; deux fonctions distinctes livrent projection publique ou données administratives.

Le durcissement applique des limites transactionnelles aux demandes de lien, publications, votes, signalements, événements et actions administratives. Le serveur transmet seulement un sujet haché. Une maintenance authentifiée agrège la télémétrie avant rétention; les journaux structurés acceptent uniquement des champs opérationnels autorisés.

Le sponsoring relie une organisation vérifiée à une unique question publiée via une campagne administrée. Le modèle ne possède volontairement aucun champ de ciblage individuel ou par réponse. Une projection service-role minimale ajoute le libellé public aux questions actives. Le propriétaire authentifié reçoit une projection distincte de ses campagnes et un rapport global par option, supprimé tant que le seuil de 20 répondants n’est pas atteint.
