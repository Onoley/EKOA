# Budgets de performance

Budget mobile : LCP ≤ 2,5 s p75, INP ≤ 200 ms p75, CLS ≤ 0,1 p75 et JavaScript initial < 200 Kio compressés par écran. Le fil vise une sélection PostgreSQL p95 < 150 ms et le classement de 100 candidats < 20 ms.

Avant lancement, mesurer sur données représentatives et conserver date, volume, région et plan `EXPLAIN (ANALYZE, BUFFERS)`. La CI vérifie le build et un parcours mobile, sans prétendre reproduire un réseau ou une base de production.
