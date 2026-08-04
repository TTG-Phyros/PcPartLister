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

Le premier démarrage crée un administrateur à partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
Ce bootstrap ne s'exécute que si la table `users` est vide : modifier `ADMIN_PASSWORD`
ensuite ne réinitialise aucun compte existant. Le mot de passe se change depuis **Profil**.

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

## Tier lists

Deux classements vivent dans [data/tier-list/](data/tier-list/), une ligne par composant :

| Fichier | Colonnes | Gamme |
| --- | --- | --- |
| [cartes-graphiques.csv](data/tier-list/cartes-graphiques.csv) | `Rang, Modèle, Marque, Gamme, Indice` | Donnée par le fichier |
| [processeurs.csv](data/tier-list/processeurs.csv) | `Rang, Processeur, Marque, Indice720p` | **Calculée** depuis l'indice |

C'est de la donnée de référence, jamais écrite par l'application, donc elle reste dans un
fichier plutôt qu'en base. Un fichier est relu au démarrage ; une ligne mal formée est signalée
dans les logs et ignorée, sans vider le tableau. Les premières lignes peuvent laisser `Rang`
vide : l'ordre du fichier fait foi.

Le fichier CPU n'a pas de colonne `Gamme` : la gamme est déduite de `Indice720p` par des
seuils, avec les mêmes six libellés que les GPU, si bien qu'un processeur « Milieu+ » et une
carte « Milieu+ » portent le même badge et la même couleur. Les seuils sont le seul réglage du
classement CPU et se modifient dans [src/lib/tier-list/kinds.ts](src/lib/tier-list/kinds.ts) :

| Gamme | Indice 720p | Actuellement |
| --- | --- | --- |
| Extrême | ≥ 100 | 16 CPU |
| Haut de gamme | ≥ 92 | 13 |
| Milieu+ | ≥ 80 | 7 |
| Milieu | ≥ 70 | 11 |
| Entrée de gamme | ≥ 60 | 7 |
| Budget | < 60 | 4 |

Tout le reste — parsing, rapprochement au catalogue, tableau — est le **même code** pour les
deux classements : `kinds.ts` porte ce qui les distingue (fichier, noms de colonnes, origine de
la gamme, unité de l'indice, libellés), et ajouter un troisième classement revient à y ajouter
une entrée.

Le tableau est triable par colonne, filtrable par marque et par gamme, et cherchable par nom
de modèle. Un composant présent au catalogue est un lien vers sa fiche. Côté GPU le
rapprochement se fait sur la **puce** (`specs.chipset`) et la quantité de VRAM, si bien qu'une
RTX 3080 12GB ne renvoie jamais vers la fiche d'une 10 Go ; côté CPU, sur le nom du modèle.
L'association est **un pour un**, parcourue dans l'ordre du classement : une fiche prise par une
ligne mieux placée n'est plus disponible pour les suivantes, ce qui sépare deux variantes d'une
même puce (« Arc A770 16GB » prend la fiche 16 Go, « Arc A770 » tombe ensuite sur la 8 Go).

Les 102 cartes et 57 des 58 processeurs du classement ont une entrée dans `catalog.json` (le
`Core i5-13500F` du fichier CPU n'existe pas chez Intel ; c'est le `Core i5-13500` qui est au
catalogue). Le `perfIndex` de ces entrées suit l'échelle du catalogue existant — environ
3,1 × l'indice côté GPU — ; il ne sert qu'à l'avis « goulot d'étranglement » et ne remplace pas
l'indice de la tier list.

Chaque classement apparaît à trois endroits :

| Où | Forme |
| --- | --- |
| `/tier-list?type=gpu` et `?type=cpu` | Le classement complet, pleine largeur, un onglet par type |
| `/catalogue?category=gpu` ou `=cpu` | Panneau replié au-dessus de la grille |
| Configurateur, emplacement « Carte graphique » ou « Processeur » | Panneau replié, plus l'indice sur chaque candidat proposé |

La fiche catalogue d'un GPU ou d'un CPU affiche également sa gamme, son indice et son rang.

## Stock

Une entrée de stock est **un exemplaire physique**, rattaché à un modèle du catalogue dont
il hérite specs et image : rien à ressaisir d'un achat à l'autre. Chaque unité porte son
prix d'achat réel, sa date, sa plateforme, le lien de l'annonce, son état et son statut.

Saisie d'un achat depuis le téléphone : `Stock → Ajouter un achat`. Le modèle se cherche
au clavier parmi le catalogue ; s'il en est absent, l'onglet **Nouveau modèle** crée
l'entrée catalogue et l'unité en une seule validation. Le bouton
« Enregistrer et en ajouter un autre » enchaîne les saisies sans repasser par la liste.

Plateformes d'achat : Vinted, Leboncoin, Facebook Marketplace, main propre, Amazon, autre.

### Stock de départ

Le stock déjà possédé est décrit par [data/seed/stock.json](data/seed/stock.json), sur le même
principe que le catalogue : une entrée = **un exemplaire physique**, une `key` stable, un
`catalogKey` qui pointe la `key` du modèle dans `catalog.json`, prix en euros et dates en
AAAA-MM-JJ. Un lot acheté ensemble s'écrit en plusieurs entrées avec le prix réparti, puisque
chaque unité vit ensuite sa propre vie.

Le seed insère uniquement les clés absentes et ne réécrit jamais une unité déjà présente : un
statut passé à « en stock » depuis l'interface survit à tous les redémarrages. Une base
recréée (volume neuf, nouveau serveur) revient donc avec le stock réel, et pas seulement avec
le catalogue. Retirer une entrée du fichier ne supprime rien en base ; c'est la fiche de
l'unité qui fait foi une fois l'import passé.

Statuts : `en transit`, `en stock`, `réservé`, `monté`, `en vente`, `vendu`, `HS`. `réservé`,
`monté` et `vendu` sont pilotés par les configurations mais restent modifiables à la main.
`en vente` est posé par le bouton « Mettre en vente » (voir [Ventes](#ventes-et-rentabilité)).

### Suivi de colis

Un achat pas encore arrivé se saisit en statut **en transit** : l'argent est déjà sorti, la
pièce n'est pas là. Elle compte donc dans l'immobilisé mais n'est proposée ni au
configurateur ni au stock disponible, et n'est jamais comptée comme dormante.

Le bloc **Suivi du colis** du formulaire prend le transporteur, le numéro de suivi, un lien
et la date de livraison prévue. Le lien de suivi est **déduit du transporteur et du numéro**
pour Mondial Relay, Colissimo/La Poste, Chronopost, DPD, GLS, UPS, DHL et FedEx ; pour les
autres (Relais Colis, transporteur inconnu, page de suivi d'une marketplace) il suffit de
coller l'URL, qui est alors prioritaire.

Le colis est ensuite accessible en un tap depuis la liste du stock, la fiche de l'unité et
le tableau de bord, avec le nombre de jours restants et un **retard** signalé dès que la date
annoncée est passée. Le bouton « Marquer comme reçu » passe l'unité en stock et enregistre la
date de réception ; le filtre **Colis en cours** de la page Stock ne garde que les livraisons
en attente.

La synthèse affiche la valeur du stock au prix d'achat, le montant immobilisé, la
répartition par catégorie et les **composants dormants** — en stock depuis plus de
`dormant_days` jours (90 par défaut, modifiable dans la table `settings`).

## Configurateur

`Configs → Nouvelle configuration`, puis un emplacement à la fois. Pour chaque catégorie,
**les unités que vous possédez apparaissent en tête** avec leur prix d'achat réel, suivies
des modèles du catalogue marqués « à acheter » au prix neuf indicatif.

Les composants incompatibles restent visibles mais grisés, **avec la raison** (« socket
AM4 ≠ LGA1700 »). Le moteur tourne dans le navigateur : changer un emplacement re-évalue
la liste ouverte instantanément, sans aller-retour serveur. Les avertissements
(goulot d'étranglement, alimentation juste, refroidissement limite) n'empêchent jamais de
sélectionner une pièce.

Le panneau de coût sépare ce qui est déjà payé de ce qui reste à acheter, ajoute les
consommables et propose un prix de vente atteignant l'objectif de marge (`target_margin_pct`).

### Cycle de vie et effet sur le stock

| État de la config | Statut des unités |
| --- | --- |
| `brouillon` | `réservé` — la pièce n'est plus proposée aux autres configs |
| `montée` | `monté` |
| `en vente` | `en vente` |
| `vendue` | `vendu` |

Retirer une ligne, revenir en arrière ou supprimer la configuration rend les unités au
stock. Une unité ne peut jamais être réservée par deux configurations : un index unique en
base le garantit, en plus du filtrage à la sélection.

## Ventes et rentabilité

Une vente se fait en deux temps, parce que c'est ainsi qu'elle se passe : on annonce, puis
un jour quelqu'un achète. Trois choses peuvent se vendre : une **configuration**, un **lot**,
ou un **composant** seul.

### 1. Mettre en vente

Le bouton **Mettre en vente** est sur la fiche d'une unité du stock, sur celle d'une
configuration montée et sur celle d'un lot. Il demande un prix — pré-rempli à l'objectif de
marge, et facultatif si le prix n'est pas encore fixé — puis passe le sujet en `en vente`
avec la date du jour.

Une unité engagée dans une configuration ou dans un lot ne se met pas en vente seule : c'est
le paquet qui part, avec toutes ses unités. La fiche de l'unité le dit et renvoie vers la
config ou le lot. **Retirer de la vente** annule l'annonce sans rien enregistrer.

### Lots

Un lot, c'est plusieurs pièces qui partent ensemble à un seul acheteur — un vrai lot annoncé
comme tel, ou trois pièces qu'un même acheteur finit par prendre d'un coup. Il se crée depuis
l'onglet **Ventes** (« Nouveau lot »), puis se remplit une unité à la fois : le sélecteur ne
propose que les unités **libres** — en stock, retenues par aucune configuration et par aucun
autre lot.

| État du lot | Statut des unités |
| --- | --- |
| `en préparation` | `réservé` — la pièce n'est plus proposée aux configurations |
| `en vente` | `en vente` |
| `vendu` | `vendu` |

Le coût de revient du lot est la somme des prix d'achat de ses unités ; la marge se calcule
sur le prix global, sans jamais répartir quoi que ce soit ligne par ligne. Retirer une unité
la rend au stock, supprimer le lot rend toutes les siennes.

Tout ce qui est en vente se retrouve en tête de l'onglet **Ventes** : depuis combien de temps,
pour combien, le coût de revient en face et la marge que le prix demandé laisserait.

### 2. Conclure la vente

Le bouton **Conclure la vente** ouvre le formulaire réel : prix de vente, date, plateforme,
**type d'envoi** (main propre, Mondial Relay, Colissimo, Chronopost, Relais Colis, Shop2Shop,
lettre suivie), frais de port, numéro de suivi, commission et notes. En main propre, le port
et le suivi disparaissent du formulaire — il n'y a pas de colis.

La marge se recalcule **à chaque frappe**, avant même d'enregistrer :

```
marge = prix de vente − frais de port − commission − (composants + consommables)
marge % = marge / prix de vente
```

Le coût d'une configuration compte ses composants à leur **prix d'achat réel** pour les unités
du stock, à leur estimation pour celles restant à acheter, plus les consommables ; celui d'un
lot est la somme de ses unités ; celui d'un composant vendu seul est simplement son prix
d'achat. Un bouton applique la commission par défaut (`default_platform_fee_pct`) au prix
saisi.

Enregistrer la vente bascule le sujet — et, pour une configuration ou un lot, toutes ses
unités — en `vendu`, dans une seule transaction. Annuler une vente le remet `en vente`.

L'historique de la page **Ventes** cumule configurations, lots et composants seuls : chiffre
d'affaires, marge cumulée, marge moyenne en € et en %, meilleure et pire vente, et le détail
de chaque vente (prix, port, commission, composants, consommables).

En base, une ligne de `sales` pointe vers **exactement un** des trois sujets (`build_id`,
`lot_id`, `inventory_item_id`) — une contrainte `num_nonnulls(...) = 1` l'impose, et un index
unique par colonne garantit une seule vente par sujet.

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
npm test        # 133 tests
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
| `data/seed/stock.json` | Exemplaires possédés, réinjectés dans le stock au démarrage |
| `data/tier-list/` | Classements des cartes graphiques et des processeurs, en CSV éditables à la main |
| `scripts/` | Migration et seed, exécutés par l'entrypoint du conteneur |
