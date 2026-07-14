# Ekoa

La taxonomie canonique est documentée dans `docs/TAXONOMY.md`. Utilisez `pnpm taxonomy:seed` pour la synchroniser sans doublon et `pnpm taxonomy:check` pour contrôler 7 univers, 30 catégories, le catalogue de tags et l’absence de données éditoriales orphelines. Aucune question de démonstration n’est créée.

L’import éditorial Excel est documenté dans `docs/QUESTION_IMPORT.md`. Toujours commencer par `pnpm questions:import --dry-run --file imports/ekoa_questions.xlsx`.

Application web mobile-first de questions communautaires. Promesse produit : « Répondez. Comparez. Comprenez. » Les résultats Ekoa décriront sa communauté et ne seront jamais présentés comme des sondages représentatifs.

## Prérequis

- Node.js 22 ou supérieur (version utilisée : 22.19.0)
- pnpm 11.12.0 via Corepack
- Docker Desktop pour Supabase local et les tests RLS

## Démarrage

```bash
corepack pnpm install
corepack pnpm exec supabase start
corepack pnpm exec supabase db reset
corepack pnpm exec supabase status -o env
cp .env.example .env.local
corepack pnpm dev
```

Reporter `API_URL` vers `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` vers `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SERVICE_ROLE_KEY` vers `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local`. Ajouter `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, puis ouvrir `http://localhost:3000`. La clé service-role sert uniquement à la sélection serveur des candidats du fil et ne doit jamais être exposée au navigateur. Les e-mails locaux sont visibles dans Mailpit sur `http://127.0.0.1:54324`.

## Vérification

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:rls
corepack pnpm test:db
corepack pnpm build
corepack pnpm test:e2e
```

Voir `docs/ROADMAP.md` avant toute nouvelle phase.

Les procédures de lancement et d’exploitation sont dans `docs/OPERATIONS.md` et `docs/LAUNCH_CHECKLIST.md`. Le local ne remplace ni une restauration Supabase répétée, ni les revues juridique et accessibilité humaines.
