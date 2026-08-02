# PcPartLister

Gestion de stock de composants d'occasion, configurateur de PC et suivi de rentabilité,
pour une activité de montage et revente.

## Démarrage

```bash
cp .env.example .env   # facultatif : tout a un défaut fonctionnel
docker compose up
```

L'application est alors disponible sur <http://localhost:3000> (ou sur le port défini par
`PORT` dans `.env`). Migrations et seed sont exécutés automatiquement au démarrage et sont
idempotents : relancer `docker compose up` ne duplique rien et n'écrase aucune donnée.

### Mode développement (hot reload)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Le code est monté depuis l'hôte ; `node_modules` et `.next` restent dans des volumes nommés
pour éviter tout conflit entre binaires Windows et Linux.

### Vérifier

```bash
curl http://localhost:3000/api/health          # {"status":"ok","database":"up"}
docker compose exec db psql -U pcpartlister -d pcpartlister -c '\dt'
```

## Configuration

Toutes les variables sont documentées dans [.env.example](.env.example). La plus sensible :
`COOKIE_SECURE` doit être `false` en HTTP simple et `true` derrière un reverse proxy HTTPS.

## Développement hors Docker

```bash
npm install
npm run db:migrate && npm run db:seed
npm run dev
npm test              # tests du moteur de compatibilité
npm run db:generate   # régénère les migrations après modification du schéma
```

## Structure

| Chemin | Rôle |
| --- | --- |
| `src/lib/db/schema.ts` | Schéma Drizzle, source de vérité de la base |
| `src/lib/specs/` | Schémas Zod des specs, une par catégorie de composant |
| `src/lib/compat/` | Moteur de compatibilité isolé et testable |
| `data/seed/catalog.json` | Catalogue de référence, éditable à la main |
| `scripts/` | Migration et seed, exécutés par l'entrypoint du conteneur |
