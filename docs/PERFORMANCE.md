# Budgets de performance

Budget mobile : LCP ≤ 2,5 s p75, INP ≤ 200 ms p75, CLS ≤ 0,1 p75 et JavaScript initial < 200 Kio compressés par écran. Le fil vise une sélection PostgreSQL p95 < 150 ms et le classement de 100 candidats < 20 ms.

Avant lancement, mesurer sur données représentatives et conserver date, volume, région et plan `EXPLAIN (ANALYZE, BUFFERS)`. La CI vérifie le build et un parcours mobile, sans prétendre reproduire un réseau ou une base de production.

La V1 borne la génération à 300 candidats, l’historique d’affinité à 1 000 événements sur 90 jours et chaque réservation à 15 questions. Le temps de génération serveur est mesuré par lot et retourné comme métadonnée non visuelle; l’objectif reste inférieur à 500 ms lorsque la latence Supabase le permet.
