# Chez Moi

Application web installable (PWA) de design d'intérieur qui **part de vos meubles**.

Vous photographiez ce que vous possédez déjà. Vous envoyez les photos d'une pièce, avec un nom
si vous voulez (chambre, salon, bureau… c'est facultatif). L'application analyse la pièce,
replace votre mobilier dedans, et ne propose à l'achat que ce qui manque vraiment — en le
cherchant dans les catalogues des magasins que vous avez configurés.

---

## Ce que fait l'application

| Étape | Ce qui se passe |
| --- | --- |
| **Inventaire** | Une photo par meuble. Le modèle identifie le type, le style, les matières, les couleurs, et estime les dimensions à partir des repères visibles. Tout reste modifiable à la main. |
| **Relevé de pièce** | Une à six photos d'une pièce. Le modèle estime la surface et la hauteur, relève la luminosité, le sol, les couleurs des murs, les éléments fixes (radiateur, cheminée, poutre) et les contraintes de circulation. |
| **Aménagement** | À partir du relevé et de votre inventaire : une direction de style, une palette, un plan vu de dessus en centimètres, le rôle de chaque meuble que vous possédez, les meubles écartés et pourquoi, les gains rapides gratuits, et les étapes. |
| **Achats** | Chaque manque devient une recherche dans les catalogues configurés, avec le prix et le lien. |
| **Moodboard** | Export PNG du projet : palette, photo de la pièce, vos meubles réutilisés, résumé. |

L'application fonctionne hors ligne pour consulter ce qui est déjà enregistré. Les analyses
et la génération d'aménagements nécessitent une connexion.

---

## Démarrage rapide

```bash
git clone https://github.com/Deiyox22/chez-moi.git
cd chez-moi
npm install
cp .env.example .env        # puis renseignez ANTHROPIC_API_KEY
npm start
```

Ouvrez http://localhost:8787. Sur mobile, le navigateur propose d'installer l'application
sur l'écran d'accueil.

Sans clé API, l'application démarre quand même : vous pouvez saisir vos meubles à la main,
enregistrer vos pièces et parcourir les catalogues. Seules l'analyse des photos et la
génération d'aménagements sont désactivées.

### Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | — | Clé API. Sans elle, les fonctions d'analyse renvoient une erreur explicite. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Modèle utilisé pour l'analyse et la conception. |
| `ANTHROPIC_EFFORT` | `high` | Profondeur de raisonnement : `low` à `max`. |
| `ANTHROPIC_ENABLE_FALLBACKS` | désactivé | Mettre à `1` pour activer le repli serveur en cas de refus du modèle. |
| `PORT` | `8787` | Port d'écoute. |
| `MAX_BODY_BYTES` | `26214400` | Taille maximale d'une requête, photos comprises. |

---

## Les vrais catalogues de magasins

C'est le point qui demande une explication honnête.

**Aucune grande enseigne d'ameublement française ne publie d'API produit ouverte.** Récupérer
un catalogue en grattant le site public d'un magasin est fragile et généralement contraire à
ses conditions d'utilisation. La voie prévue et légale est le **flux produit** que ces enseignes
publient déjà pour leurs partenaires : flux Google Merchant (XML), export CSV d'affiliation,
ou accord direct.

L'application est construite autour de cette voie :

1. Ouvrez `config/stores.json`.
2. Pour l'enseigne voulue, renseignez `feed.url` et passez `enabled` à `true`.
   Trois formats sont reconnus : `google-merchant-xml`, `csv`, `json`.
3. Lancez l'import :

```bash
npm run catalog:sync              # toutes les enseignes activées
npm run catalog:sync -- ikea      # une seule
```

Les produits importés atterrissent dans `data/catalog/<magasin>.json` et remplacent aussitôt
le catalogue d'exemple pour cette enseigne. La page **Magasins** indique, enseigne par enseigne,
si les produits viennent d'un flux réel ou de l'exemple.

Vous pouvez aussi renseigner un `affiliate.param` / `affiliate.value` par enseigne : il est
ajouté aux liens sortants.

**Tant qu'aucun flux n'est configuré**, l'application utilise le catalogue d'exemple embarqué
(`server/catalog/data/seed-catalog.json`, 32 produits génériques). Ses prix sont indicatifs et
ses liens pointent vers la **recherche du site** du magasin, jamais vers une référence inventée.
L'interface signale systématiquement quand un prix est indicatif.

Enseignes pré-déclarées, prêtes à recevoir un flux : IKEA, Maisons du Monde, Leroy Merlin,
La Redoute Intérieurs, Conforama, BUT. En ajouter une revient à ajouter un objet dans
`config/stores.json`.

---

## Architecture

```
server/                 API Node, sans framework
  index.js              routeur HTTP + fichiers statiques
  config.js             configuration et chargement du .env
  lib/anthropic.js      appel modèle en sortie structurée (JSON schema)
  lib/schemas.js        schémas des trois réponses attendues
  routes/               analyse meuble, analyse pièce, génération, catalogue
  catalog/
    store.js            index et recherche pondérée sur tous les catalogues
    sync.js             import des flux produits
    providers/feed.js   lecteurs XML Google Merchant, CSV, JSON
    data/seed-catalog.json
config/stores.json      enseignes et flux
web/                    la PWA (ES modules, sans étape de build)
  js/lib/               IndexedDB, appareil photo, API, plan SVG, moodboard
  js/views/             accueil, meubles, pièces, designs, magasins, réglages
  sw.js                 service worker : coquille hors ligne, API toujours en direct
```

Trois appels modèle, chacun en **sortie structurée** (`output_config.format`), donc validés
contre un schéma JSON plutôt que devinés dans du texte libre :

- inventaire d'un meuble depuis 1 à 4 photos ;
- relevé d'une pièce depuis 1 à 6 photos ;
- conception de l'aménagement, qui reçoit le relevé, l'inventaire, les préférences et les
  photos de la pièce.

Les photos sont réduites à 1568 px sur le plus grand côté et converties en JPEG avant d'être
envoyées, ce qui limite fortement le coût en jetons.

### Commandes

```bash
npm start              # serveur
npm run dev            # serveur avec rechargement
npm run catalog:sync   # import des flux produits
npm run icons          # régénère les icônes PNG de la PWA
npm run check          # analyse syntaxique de tous les fichiers JavaScript
```

---

## Vos données

Vos photos, vos meubles, vos pièces et vos aménagements sont stockés **dans le navigateur**
(IndexedDB), sur votre appareil. Le serveur ne conserve rien : les photos ne le traversent que
le temps d'une analyse. L'écran **Réglages** permet d'exporter vos fiches en JSON, de nettoyer
les photos orphelines et de tout effacer.

Déployer ce serveur en ligne l'expose à quiconque connaît l'URL, et donc à une consommation
d'API à vos frais. Pour un usage familial, gardez-le sur votre réseau local ou placez une
authentification devant.

---

## Limites connues

- **Les dimensions sont des estimations photographiques**, pas des mesures. Mesurez au mètre
  avant tout achat. L'interface le rappelle sur chaque plan.
- **Le plan est schématique** : rectangles vus de dessus, pas un plan d'architecte coté.
- **Pas de rendu photoréaliste** de la pièce réaménagée. La proposition est décrite, chiffrée,
  mise en plan et résumée en moodboard, mais l'application ne fabrique pas d'image de synthèse.
- **La qualité dépend des photos.** Une pièce prise depuis deux ou trois angles, en cadrant murs
  et sol, donne un relevé nettement meilleur qu'un cliché unique.

## Licence

MIT — voir [LICENSE](LICENSE).
