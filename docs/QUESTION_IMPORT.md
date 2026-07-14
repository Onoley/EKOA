# Import éditorial des questions

Ce pipeline CLI est réservé au serveur. Il ne crée aucun compte et n’expose aucune route HTTP. Le fichier réel `imports/ekoa_questions.xlsx` et les rapports générés sont ignorés par Git.

## Préparation

1. Appliquer la migration `202607140002_question_editorial_import.sql` dans l’environnement visé.
2. Sauvegarder la base avant tout import réel.
3. Placer le classeur dans `imports/ekoa_questions.xlsx`, ou utiliser `--file chemin/vers/fichier.xlsx`.
4. Configurer `SUPABASE_SERVICE_ROLE_KEY` uniquement côté serveur.
5. Configurer exactement une identité éditoriale : `EKOA_EDITORIAL_ACCOUNT_ID` (profil actif existant), ou `EKOA_EDITORIAL_ORGANISATION_ID` (organisation existante dont le propriétaire actif devient l’auteur).

Aucun compte ni aucune organisation ne sont créés automatiquement.

## Classeur Excel

Les feuilles `Questions`, `Categories` et `Instructions` sont obligatoires. La première ligne de `Questions` contient ces en-têtes :

| Colonne | Règle |
| --- | --- |
| `external_id` | Obligatoire, unique, 1 à 128 caractères (`A-Z`, chiffres, `.`, `_`, `:`, `-`) |
| `universe_slug` | Univers actif existant |
| `category_slug` | Catégorie active appartenant à l’univers |
| `question` | 10 caractères minimum, maximum défini dans `question_settings` |
| `option_1` à `option_6` | Deux à six réponses, sans trou ni doublon |
| `tag_1` à `tag_3` | Tags actifs, uniques et autorisés pour la catégorie |
| `minimum_age`, `maximum_age` | Facultatifs, entiers de 18 à 120, minimum ≤ maximum |
| `sensitivity` | `low`, `medium` ou `high` |
| `editorial_type` | Format : `opinion`, `projection`, `regulation`, `comportement` ou `dilemme` |
| `publication_priority` | Entier de 0 à 100 |
| `status` | Statut de ligne : `ready`, `review` ou `rejected` |
| `editorial_note` | Facultative, 2 000 caractères maximum |

Une colonne `tag_4` ou supérieure est refusée. Les URL, adresses e-mail, numéros de téléphone, identifiants personnels et termes interdits sont contrôlés dans la question et les options.

Le nom Excel `editorial_type` est conservé pour compatibilité, mais alimente `questions.question_format`. Le champ interne `questions.editorial_type` décrit une temporalité distincte (`evergreen`, `topical`, `debate`, `experience`, `prediction`) et reçoit actuellement `evergreen` par défaut.

Correspondance explicite des statuts : `ready` → `published`, `review` → `draft`, `rejected` → ligne validée puis ignorée avec avertissement.

## Commandes

```bash
pnpm questions:validate --file imports/ekoa_questions.xlsx
pnpm questions:sync-taxonomy --file imports/ekoa_questions.xlsx
pnpm questions:import --dry-run --file imports/ekoa_questions.xlsx
pnpm questions:import --file imports/ekoa_questions.xlsx
pnpm questions:check --file imports/ekoa_questions.xlsx
```

`questions:sync-taxonomy` est la seule commande qui écrit pendant la phase de compatibilité : elle valide la feuille `Tags`, crée ou met à jour sans suppression les tags contrôlés, puis ajoute les couples catégorie-tag réellement utilisés avec `is_featured=false`. Elle est idempotente et ne touche jamais aux questions. `questions:validate` et le `--dry-run` ne réalisent aucune écriture.

L’import réel est entièrement refusé si une erreur de validation subsiste. Les écritures sont regroupées par lots de 50 ; chaque question, sa série, ses options et ses tags sont enregistrés dans une fonction PostgreSQL atomique réservée au `service_role`. Une erreur critique arrête immédiatement les lots suivants et le rapport indique le lot et le nombre déjà traité.

## Idempotence et contrôle

- `external_id` présent avec le même hash : ligne ignorée avec avertissement ;
- `external_id` présent avec un contenu différent : conflit bloquant ;
- question normalisée identique avec un autre identifiant : doublon bloquant ;
- univers, catégorie ou tag inconnu/inactif : erreur bloquante ;
- tag actif non associé à la catégorie : avertissement non bloquant ; la commande de synchronisation peut ensuite créer la recommandation.

`questions:check` relit le fichier puis vérifie les identifiants attendus, catégories, deux à six options, doublons d’options, trois tags maximum et l’absence d’options ou associations orphelines. Il ne modifie rien.

## Restauration et limites

Produire une sauvegarde datée avant tout import réel. Pour restaurer, travailler d’abord dans un environnement isolé et ne jamais lancer `supabase db reset`, `TRUNCATE` ou une suppression globale. Le `batchId` du rapport identifie les questions du lot pour une correction contrôlée.

- Les feuilles `Categories` et `Instructions` sont obligatoires mais documentaires ; la taxonomie en base fait autorité.
- La détection interdite est déterministe ; une relecture humaine reste nécessaire.
- L’atomicité porte sur une question complète. Un échec tardif conserve les questions déjà validées, arrête la suite et génère un rapport partiel.
- Aucun fichier réel et aucune question réelle ne sont fournis ou importés pendant cette phase.
