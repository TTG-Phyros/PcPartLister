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

## Authentification

Aucune page ni route API n'est accessible sans session valide, à la seule exception de
`/connexion` et `/api/health`. Il n'y a pas d'inscription publique : les comptes se créent
depuis **Comptes** (réservé aux administrateurs).

Le premier démarrage crée un administrateur à partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`,
avec changement de mot de passe obligatoire à la première connexion. Ce bootstrap ne
s'exécute que si la table `users` est vide : modifier `ADMIN_PASSWORD` ensuite ne
réinitialise aucun compte existant.

- Mots de passe hachés en Argon2id (19 Mio, 2 itérations, 1 lane — paramètres OWASP).
- Sessions en base ; le cookie contient un jeton aléatoire dont seule une empreinte HMAC
  est stockée. Un dump de la base ne permet pas de rejouer une session.
- Cookie `httpOnly`, `SameSite=Lax`, `secure` selon `COOKIE_SECURE`, expiration glissante.
- Connexion limitée par IP : fenêtre glissante de 15 min, 10 échecs maximum, avec délai
  progressif (1 s, 2 s, 4 s, 8 s) à partir du 3ᵉ échec.

> **Derrière un reverse proxy**, assurez-vous qu'il transmet `X-Forwarded-For`. Sans cela
> toutes les requêtes semblent venir de la même adresse et le rate limiting devient global
> au lieu d'être par client.

## Catalogue

Le catalogue décrit des **modèles** de composants, indépendamment de ce qui est possédé.
Il est livré pré-rempli par [data/seed/catalog.json](data/seed/catalog.json), un fichier
éditable à la main : prix en euros, une clé stable par entrée, et les `specs` sans le
discriminant de catégorie (ajouté automatiquement au chargement).

Enrichir le catalogue par le fichier :

1. ajouter une entrée avec une `key` unique en kebab-case ;
2. `docker compose restart app`.

Le seed insère uniquement ce qui manque. Une entrée déjà présente n'est jamais écrasée,
donc les modifications faites depuis l'interface survivent à tous les redémarrages. Une
entrée mal formée est signalée dans les logs et ignorée, sans bloquer les autres.

### Images

Chaque entrée reçoit une image dans le volume `images`, servie par `/api/images` derrière
la session (le volume n'est jamais exposé en statique). Le champ `imageUrl` est optionnel :
s'il est présent et joignable, l'image est téléchargée ; sinon un visuel de remplacement
SVG est généré localement. **L'application reste donc entièrement fonctionnelle sans
réseau.** Depuis l'interface, chaque composant accepte une image uploadée (PNG, JPEG,
WebP, GIF, SVG, 5 Mo max) qui remplace le visuel généré.

## Stock

Une entrée de stock est **un exemplaire physique**, rattaché à un modèle du catalogue dont
il hérite specs et image : rien à ressaisir d'un achat à l'autre. Chaque unité porte son
prix d'achat réel, sa date, sa plateforme, le lien de l'annonce, son état et son statut.

Saisie d'un achat depuis le téléphone : `Stock → Ajouter un achat`. Le modèle se cherche
au clavier parmi le catalogue ; s'il en est absent, l'onglet **Nouveau modèle** crée
l'entrée catalogue et l'unité en une seule validation. Le bouton
« Enregistrer et en ajouter un autre » enchaîne les saisies sans repasser par la liste.

Statuts : `en stock`, `réservé`, `monté`, `vendu`, `HS`. Les trois du milieu seront pilotés
par les configurations (étapes 6 et 7) mais restent modifiables à la main.

La synthèse affiche la valeur du stock au prix d'achat, le montant immobilisé, la
répartition par catégorie et les **composants dormants** — en stock depuis plus de
`dormant_days` jours (90 par défaut, modifiable dans la table `settings`).

## Moteur de compatibilité

Isolé dans [src/lib/compat/](src/lib/compat/) : fonctions pures, aucun import de base de
données, de React ou de Next.js. Il tourne donc à l'identique côté serveur et côté
navigateur, et se teste avec de simples objets.

**Ajouter une règle** = un fichier dans `rules/` + une ligne dans
[registry.ts](src/lib/compat/registry.ts). Aucun composant d'interface à toucher.

```ts
export const maRegle: Rule = {
  id: 'ma-regle',
  label: 'Ce que la règle vérifie',
  slots: ['gpu', 'case'],          // sur quels emplacements elle porte
  evaluate: (selection) =>
    condition ? ok('…') : blocking('raison affichée'),  // null = non applicable
};
```

Deux points d'entrée :

- `evaluate(selection)` — état complet d'une configuration, résultats séparés en
  `blockingIssues()` et `warnings()`.
- `checkCandidate(selection, categorie, candidat)` — verdict d'un composant proposé, qui
  **ne remonte que ce que le candidat provoque lui-même**. Un problème déjà présent
  ailleurs dans la config ne grise pas des pièces sans rapport.

19 règles couvrent socket et chipset CPU/carte mère, type, nombre, capacité et fréquence
mémoire, format carte mère et alimentation vs boîtier, longueur GPU, hauteur ventirad,
taille de radiateur AIO, socket et TDP du refroidissement, puissance et connecteurs PCIe
de l'alimentation, ports SATA et slots M.2, plus deux avis non bloquants (goulot
d'étranglement CPU/GPU, absence de sortie vidéo).

```bash
npm test        # 87 tests
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
