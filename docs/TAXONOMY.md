# Taxonomie canonique Ekoa v1

La remise à zéro éditoriale du 14 juillet 2026 conserve Auth, profils, rôles, vérifications et organisations. Elle retire les anciennes questions, réponses, interactions, campagnes éditoriales, catégories et tags. Aucune question n’est importée par cette phase.

La source de vérité versionnée est `taxonomy/catalog.mjs`. Elle définit 7 univers, 30 catégories, 195 tags contrôlés et leurs associations initiales. Les identifiants UUID sont dérivés de manière déterministe des slugs. Les couples additionnels issus d’un classeur éditorial contrôlé sont synchronisés sans retirer les associations existantes.

## Univers

1. Société, politique & monde
2. Travail, argent & vie matérielle
3. Relations & identité personnelle
4. Culture & divertissement
5. Mode de vie & passions
6. Technologies, médias & innovation
7. Mobilité & déplacements

Les univers organisent seulement l’affichage. Les membres suivent des catégories et chaque question appartient à une catégorie. Les tags ont une sensibilité `low`, `medium` ou `high`; cette information ne doit jamais servir à déduire le profil d’un membre.

## Commandes

- `pnpm taxonomy:generate` régénère la migration depuis la source canonique.
- `pnpm taxonomy:seed` synchronise la taxonomie sans doublon et refuse de démarrer si une question existe.
- `pnpm taxonomy:check` vérifie les volumes, slugs, rattachements et l’absence de données éditoriales résiduelles.

Le vieux seed de questions de démonstration est désactivé. Le futur import de questions devra constituer une phase séparée.

## Sauvegarde et restauration

Le dump préalable est local, ignoré par Git et protégé en lecture propriétaire. Dans un environnement isolé ayant reçu les migrations jusqu’à la version précédant la remise à zéro :

```sh
psql "$DATABASE_URL" --single-transaction --file .backups/ekoa-before-taxonomy-reset-2026-07-14.sql
```

La restauration doit être répétée hors production avant tout basculement. Le dump contient `session_replication_role = replica` afin de gérer les relations circulaires des vagues de questions. Ne jamais publier le dump ni la chaîne de connexion.
