# Exploitation

## Environnements et secrets

La clé service Supabase, le secret du cron et l’URL de supervision optionnelle sont gérés dans l’environnement de déploiement. Aucun secret ne doit entrer dans Git, un ticket ou un journal.

## Sauvegarde et restauration

Avant lancement, activer les sauvegardes du plan Supabase retenu et relever RPO/RTO. Une répétition trimestrielle doit restaurer la dernière sauvegarde dans un projet UE isolé, vérifier les volumes sans exporter de données personnelles, exécuter les tests RLS puis détruire cet environnement. Consigner date, opérateur, durée et écarts.

Cette procédure n’est pas déclarée répétée dans le dépôt : elle exige un projet Supabase opérationnel et une validation humaine. `supabase db reset` valide les migrations, pas une sauvegarde de production.

## Maintenance et incidents

Vercel appelle chaque jour `/api/cron/maintenance` avec `Authorization: Bearer $CRON_SECRET`. La fonction agrège les événements par question/jour avant de purger événements et impressions au-delà de `ANALYTICS_RETENTION_DAYS` (90 jours par défaut, à confirmer juridiquement).

`OBSERVABILITY_WEBHOOK_URL` reçoit uniquement nom d’événement et contexte autorisé. Alerter sur erreurs serveur, échecs de maintenance et refus répétés vote/signalement. Ne jamais inclure corps, e-mail, démographie, option choisie, jeton ou URL magique.
