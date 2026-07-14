# Sécurité et confidentialité

- Politique par défaut : refus d’accès, puis autorisations RLS minimales et nommées.
- Validation Zod côté serveur et vérification d’autorisation dans les services métier.
- Démographie et votes individuels privés; résultats uniquement agrégés.
- Secrets dans les variables d’environnement, jamais dans Git ni dans les journaux.
- La clé service-role ne doit jamais porter le préfixe `NEXT_PUBLIC_`.
- Actions administratives importantes auditées et immuables.
- Les niveaux de sensibilité des tags décrivent le sujet éditorial; ils ne constituent jamais une donnée de profil ni une autorisation de ciblage.
- Le catalogue contrôlé et les relations catégorie-tag sont validés en base. Un client ne peut pas créer un tag arbitraire.

RLS est actif sur `profiles`, `categories` et `category_follows`. Un utilisateur lit uniquement son profil et ses propres suivis; il ne peut modifier directement ni démographie, ni rôle, ni statut. Les catégories actives sont disponibles pendant l’onboarding et pour les comptes actifs. Les changements de suivi exigent un compte actif et l’identité du propriétaire.

Les tests SQL pgTAP simulent plusieurs identités authentifiées et vérifient lecture privée, interdiction d’élévation de rôle et isolation des suivis. Une revue juridique française/européenne reste nécessaire avant lancement public.

Les brouillons et séries ne sont visibles que par leur auteur. Les questions publiées, leurs options et leurs tags sont lisibles par les membres actifs. Toute écriture passe par des fonctions `security definer` qui revalident le compte, les longueurs, la catégorie, les âges, les réponses distinctes, les coordonnées, les quotas et les doublons. Des verrous transactionnels empêchent les publications concurrentes de contourner quotas ou détection exacte.

Les colonnes `vote_count` et autres compteurs d’engagement ne sont plus accordées en lecture directe. Un utilisateur peut lire uniquement ses propres lignes de vote, suivi et soutien. Les résultats agrégés passent par une fonction qui exige son vote et ne renvoie aucun identifiant de votant. Les votes sont immuables; une répétition identique est idempotente et une autre option est refusée. Les questions retirées, non publiées ou modérées ne livrent plus de résultats et n’acceptent plus d’engagement.

Les tables de télémétrie du fil ne sont jamais exposées directement aux rôles navigateur. La fonction d’ingestion remplace l’identité par `auth.uid()`, limite les horodatages, métadonnées et durées, exige une impression appartenant au demandeur et accepte seulement `impression`, `skip` et `dwell`. Les événements métier sont produits après les écritures faisant autorité. La fonction de candidats est réservée au rôle de service dans un module `server-only`; sa réponse HTTP retire les métriques utilisées pour le score.

La découverte passe elle aussi par une fonction accessible uniquement au rôle de service. L’application vérifie d’abord la session et le statut actif, puis transmet explicitement l’utilisateur courant. La fonction répète l’autorisation et exclut contenus retirés, modérés, hors âge et auteurs bloqués. Seuls les noms de comptes vérifiés participent à la recherche d’auteur. Les réponses ne contiennent ni compteurs de classement, ni votes, ni données démographiques.

Les rôles navigateur ne disposent d’aucun droit direct d’écriture sur `comments` ou `reports`. Les commentaires visibles sont lisibles uniquement avec une question encore éligible; les statuts masqué et retiré restent accessibles aux modérateurs et administrateurs pour la future interface protégée. La création exige le vote du demandeur côté base. Les signalements sont privés pour leur auteur, utilisent une seule cible vérifiée et ne sont jamais exposés dans les projections publiques.

Les profils publics sont produits par des fonctions dédiées qui excluent démographie, statut interne, votes et historique privé. Le suivi est refusé pour une cible ordinaire, inactive ou identique au demandeur. Les changements démographiques n’utilisent aucune mise à jour directe de `profiles`.

Les demandes de suppression et traces de cycle de vie sont lisibles uniquement par leur propriétaire et non modifiables directement. L’anonymisation applicative est réservée au rôle service; elle conserve les votes sans nom public, supprime les données comportementales non nécessaires et neutralise les détails de signalement. La suppression douce Auth doit être exécutée depuis le module serveur avec la clé service-role. Les délais et exceptions de conservation nécessitent encore validation juridique avant automatisation.

Les pages administratives redirigent tout membre ordinaire. Les fonctions de modération utilisent `is_moderator`; suspension, vérification, recherche administrative de compte et gestion des termes utilisent `is_admin`. Ces décisions reposent sur la ligne courante en base, jamais sur des métadonnées JWT modifiables.

Les tables de cas, actions, audit et vérification refusent toute écriture directe aux rôles navigateur. Les actions passent par des fonctions transactionnelles et les journaux ne possèdent aucune politique de mise à jour ou suppression. Les modérateurs lisent cas/actions; seuls les admins lisent l’audit administratif et les champs privés de vérification. La projection publique omet site officiel, responsable et notes.

Les surfaces critiques consomment un compartiment de débit transactionnel. La base ne stocke qu’un SHA-256 contextualisé et réserve fonctions/tables au service-role. Les en-têtes interdisent encadrement et permissions appareil inutiles. Les logs excluent charges utiles, démographie, réponses, e-mails et secrets par leur schéma fermé.

Les tables sponsor n’accordent aucune lecture directe au navigateur. Les administrateurs créent organisations et campagnes par fonctions qui relisent rôle, vérification, question et catégorie; `politique` est refusée transactionnellement. Le cycle de vie et les paramètres financiers produisent un audit immuable. Le propriétaire ne reçoit que ses campagnes et des agrégats globaux; sous 20 réponses, la fonction retourne uniquement l’état supprimé et le total, jamais les cellules. La projection d’étiquette active est réservée au serveur.
