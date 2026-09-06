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
| **Achats** | Chaque manque devient une recherche produit : d'abord dans les catalogues importés, puis, si besoin, en direct sur les sites des magasins, avec le prix et le lien. |
| **Moodboard** | Export PNG du projet : palette, photo de la pièce, vos meubles réutilisés, résumé. |

L'application fonctionne hors ligne pour consulter ce qui est déjà enregistré. Les analyses
et la génération d'aménagements nécessitent une connexion.

[![Déployer avec Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDeiyox22%2FChez-moi&env=ANTHROPIC_API_KEY&envDescription=Cl%C3%A9%20API%20Anthropic%20nécessaire%20à%20l%27analyse%20des%20photos&envLink=https%3A%2F%2Fconsole.anthropic.com%2Fsettings%2Fkeys&project-name=chez-moi&repository-name=chez-moi)

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
| `ANTHROPIC_EFFORT` | `high`, `medium` sur Vercel | Profondeur de raisonnement : `low` à `max`. |
| `ANTHROPIC_ENABLE_FALLBACKS` | désactivé | Mettre à `1` pour activer le repli serveur en cas de refus du modèle. |
| `CATALOG_LIVE_SEARCH` | `0` | Mettre à `1` pour chercher en direct sur les sites des magasins. |
| `CATALOG_LIVE_MIN_RESULTS` | `2` | Seuil de résultats locaux en dessous duquel la recherche en ligne se déclenche. |
| `PORT` | `8787` | Port d'écoute. |
| `MAX_BODY_BYTES` | `26214400` | Taille maximale d'une requête, photos comprises. |

---

## Les vrais catalogues de magasins

Deux chemins, complémentaires, parce qu'aucune enseigne d'ameublement française ne publie
d'API produit ouverte et que gratter leur site public serait fragile et contraire à leurs
conditions d'utilisation.

### 1. Recherche en direct sur les sites des magasins

C'est le chemin qui marche sans compte ni contrat. Le modèle interroge le web avec sa
recherche intégrée, **strictement limitée aux domaines déclarés** dans `config/stores.json`,
et rapporte de vraies fiches produit : titre tel qu'il apparaît sur le site, prix affiché,
lien direct. Chaque produit porte une mention `vérifié` ou `probable` selon que le prix vient
d'une page réellement consultée, et l'interface marque les prix `probable` comme indicatifs.

```bash
CATALOG_LIVE_SEARCH=1 npm start
```

Dans l'écran **Magasins**, le bouton « Chercher sur les sites des magasins » lance la recherche
à la demande. Pendant la génération d'un aménagement, elle ne se déclenche que pour les besoins
que les catalogues locaux ne couvrent pas — au-dessus de `CATALOG_LIVE_MIN_RESULTS` produits
trouvés localement, rien n'est dépensé. Chaque recherche consomme des jetons, d'où le réglage
désactivé par défaut.

### 2. Import d'un flux produit

Pour disposer d'un catalogue **complet et hors ligne**, la voie prévue par les enseignes est le
flux produit qu'elles fournissent déjà à leurs partenaires : flux Google Merchant (XML), export
CSV d'affiliation, ou accord direct. Trois formats sont reconnus : `google-merchant-xml`, `csv`,
`json`.

1. Ouvrez `config/stores.json`.
2. Renseignez `feed.url` pour l'enseigne voulue et passez `enabled` à `true`.
3. Lancez l'import :

```bash
npm run catalog:sync              # toutes les enseignes activées
npm run catalog:sync -- ikea      # une seule
```

Un flux peut aussi être un **fichier local**, ce qui permet d'essayer l'import tout de suite,
sans compte affilié. Un exemple est fourni :

```jsonc
// config/stores.json, entrée "ikea"
"enabled": true,
"feed": { "type": "google-merchant-xml", "url": "./docs/exemple-flux-google-merchant.xml" }
```

```bash
npm run catalog:sync -- ikea
# - IKEA : 4 produits importes -> data/catalog/ikea.json
```

Les produits importés atterrissent dans `data/catalog/<magasin>.json` et **remplacent aussitôt**
le catalogue d'exemple pour cette enseigne. L'écran **Magasins** indique, enseigne par enseigne,
d'où viennent les produits.

Vous pouvez renseigner un `affiliate.param` / `affiliate.value` par enseigne : il est ajouté aux
liens sortants.

### Sans rien configurer

L'application utilise le catalogue d'exemple embarqué (`server/catalog/data/seed-catalog.json`,
32 produits génériques). Ses prix sont indicatifs et ses liens pointent vers la **recherche du
site** du magasin, jamais vers une référence inventée. L'interface signale systématiquement
quand un prix est indicatif.

Enseignes pré-déclarées : IKEA, Maisons du Monde, Leroy Merlin, La Redoute Intérieurs,
Conforama, BUT. En ajouter une revient à ajouter un objet dans `config/stores.json`, avec son
`domain` pour la recherche en ligne et son `searchUrlTemplate` pour les liens de repli.

---

## Déploiement sur Vercel

Le dépôt est prêt à être importé tel quel : `public/` est servi en statique, `api/[...path].js`
expose l'API en fonction serverless, et `vercel.json` porte la configuration.

1. Sur [vercel.com/new](https://vercel.com/new), importez `Deiyox22/Chez-moi`.
2. Laissez le framework sur « Other ». Aucune commande de build n'est nécessaire.
3. Ajoutez les variables d'environnement dans **Settings → Environment Variables** :
   `ANTHROPIC_API_KEY`, et si vous le voulez `CATALOG_LIVE_SEARCH=1`.
4. Déployez.

En ligne de commande :

```bash
npm i -g vercel
vercel login
vercel link
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

Trois points à connaître avant de déployer.

**Le système de fichiers est en lecture seule.** `npm run catalog:sync` ne peut donc pas tourner
en production. Synchronisez vos flux en local, puis **commitez** `data/catalog/*.json` : ces
fichiers sont ignorés par défaut dans `.gitignore`, retirez la ligne si vous déployez avec des
catalogues importés.

**Les fonctions ont une durée limitée.** `vercel.json` demande 60 secondes, le maximum courant.
La génération d'un aménagement est l'appel le plus long, c'est pourquoi l'effort de raisonnement
passe automatiquement à `medium` sur Vercel. Si vous voyez des délais dépassés, descendez à
`ANTHROPIC_EFFORT=low` ; si vous préférez la qualité et que vous avez un plan qui l'autorise,
remontez à `high`.

**Un déploiement public consomme votre quota d'API.** Rien ne protège l'URL par défaut. Mettez
au minimum la protection par mot de passe de Vercel (Settings → Deployment Protection), ou
gardez le déploiement en preview privée.

---

## Architecture

```
api/[...path].js        point d'entree serverless (Vercel)
vercel.json             configuration du deploiement
server/                 API Node, sans framework
  index.js              serveur local
  handler.js            routeur partage entre le serveur local et Vercel
  config.js             configuration et chargement du .env
  lib/anthropic.js      appel modèle en sortie structurée (JSON schema)
  lib/schemas.js        schémas des trois réponses attendues
  routes/               analyse meuble, analyse pièce, génération, catalogue
  catalog/
    store.js            index et recherche pondérée sur tous les catalogues
    sync.js             import des flux produits
    providers/feed.js   lecteurs XML Google Merchant, CSV, JSON
    providers/websearch.js  recherche en direct sur les sites des magasins
    data/seed-catalog.json
config/stores.json      enseignes et flux
public/                 la PWA (ES modules, sans étape de build)
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
- **La recherche en direct dépend de ce que les moteurs indexent.** Un prix peut avoir changé
  depuis l'indexation, et un produit peut être en rupture. Les résultats marqués `probable`
  n'ont pas de prix confirmé : vérifiez sur la fiche avant de commander.

## Licence

MIT — voir [LICENSE](LICENSE).
