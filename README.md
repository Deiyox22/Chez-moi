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
cp .env.example .env        # puis renseignez GEMINI_API_KEY ou ANTHROPIC_API_KEY
npm start
```

Ouvrez http://localhost:8787. Sur mobile, le navigateur propose d'installer l'application
sur l'écran d'accueil.

### Quel fournisseur d'IA

L'application marche indifféremment avec **Google Gemini** ou **Anthropic Claude**. Vous ne
renseignez qu'une clé, et le fournisseur s'en déduit :

| Clé présente | Fournisseur retenu | Modèle par défaut |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini | `gemini-2.5-flash` |
| `ANTHROPIC_API_KEY` | Claude | `claude-opus-5` |
| les deux | Claude, sauf si `AI_PROVIDER=gemini` | selon le fournisseur |

Le défaut `gemini-2.5-flash` est un choix prudent : il gère la vision et la sortie
structurée, et reste disponible partout. Une clé récente donne accès à bien plus rapide et
plus capable (`gemini-flash-latest`, `gemini-pro-latest`, les versions 3.x) ; changez de
modèle avec `GEMINI_MODEL` sans rien toucher d'autre.

Deux erreurs sont traduites plutôt que remontées brutes :

- **modèle inaccessible** — le serveur liste les modèles que votre clé peut réellement
  atteindre, au lieu d'un 404 opaque ;
- **crédits épuisés** — un projet Google AI Studio sans crédits refuse tous les appels, même
  un simple « bonjour ». Le message renvoie vers
  [ai.studio/projects](https://ai.studio/projects) pour recharger, et distingue ce cas d'un
  simple dépassement de cadence.

Sans aucune clé, l'application démarre quand même : vous pouvez saisir vos meubles à la main,
enregistrer vos pièces et parcourir les catalogues. Seules l'analyse des photos et la
génération d'aménagements sont désactivées.

### Variables d'environnement

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Clé Google Gemini. Sans clé d'IA, les fonctions d'analyse renvoient une erreur explicite. |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Modèle Gemini utilisé pour l'analyse et la conception. |
| `ANTHROPIC_API_KEY` | — | Clé Anthropic, alternative à la précédente. |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Modèle Claude utilisé pour l'analyse et la conception. |
| `AI_PROVIDER` | déduit de la clé | Force `gemini` ou `anthropic` quand les deux clés sont présentes. |
| `ANTHROPIC_EFFORT` | `high`, `medium` sur Vercel | Profondeur de raisonnement : `low` à `max`. |
| `ANTHROPIC_ENABLE_FALLBACKS` | désactivé | Mettre à `1` pour activer le repli serveur en cas de refus du modèle. |
| `CATALOG_LIVE_SEARCH` | `0` | Mettre à `1` pour chercher en direct sur les sites des magasins. |
| `CATALOG_LIVE_MIN_RESULTS` | `2` | Seuil de résultats locaux en dessous duquel la recherche en ligne se déclenche. |
| `PORT` | `8787` | Port d'écoute. |
| `MAX_BODY_BYTES` | `26214400` | Taille maximale d'une requête, photos comprises. |

---

## Les vrais catalogues de magasins

**1 310 produits réels sont déjà chargés**, importés depuis les catalogues de quatre boutiques
françaises : [Hartô](https://harto.fr) (mobilier design), [Maison Sarah
Lavoine](https://maisonsarahlavoine.com) (mobilier et décoration), [Honoré
Déco](https://honoredeco.com) (décoration) et [Tediber](https://tediber.com) (literie). Vrais
titres, vrais prix, vraies photos, lien direct vers la fiche produit.

L'import passe par le point d'accès `/products.json` que ces boutiques exposent publiquement
et que leur `robots.txt` n'interdit pas. Aucun compte, aucune clé, aucune extraction de page.

```bash
npm run catalog:sync              # toutes les enseignes activées
npm run catalog:sync -- harto     # une seule
```

Les catalogues importés sont **commités** dans `data/catalog/` : en production le système de
fichiers est en lecture seule, la synchronisation ne peut donc pas y tourner. Un workflow
GitHub les rafraîchit tous les lundis et redéploie
(`.github/workflows/refresh-catalogues.yml`), avec un garde-fou qui refuse un import vide ou
anormalement petit.

### Ajouter une enseigne

Quatre formats de flux sont reconnus : `shopify`, `google-merchant-xml`, `csv`, `json`.

```jsonc
{
  "id": "ma-boutique",
  "name": "Ma Boutique",
  "currency": "EUR",
  "site": "https://ma-boutique.fr",
  "domain": "ma-boutique.fr",
  "searchUrlTemplate": "https://ma-boutique.fr/search?q={query}",
  "enabled": true,
  "feed": { "type": "shopify", "url": "https://ma-boutique.fr" }
}
```

Pour savoir si une boutique expose un flux Shopify :
`curl -s https://la-boutique.fr/products.json?limit=1`. Une réponse JSON avec un tableau
`products`, et pas de `Disallow` correspondant dans son `robots.txt`, suffisent.

### Les grandes enseignes

IKEA, Maisons du Monde, Leroy Merlin, La Redoute Intérieurs, Conforama et BUT restent
déclarées mais désactivées : **aucune ne publie d'API produit ouverte**, et extraire leur site
serait fragile et contraire à leurs conditions d'utilisation. Leur catalogue passe par le flux
produit qu'elles réservent à leurs partenaires (Google Merchant, export CSV d'affiliation,
accord direct). Renseignez `feed.url` et passez `enabled` à `true`, puis relancez la
synchronisation.

Un flux peut aussi être un **fichier local**, ce qui permet d'essayer l'import sans compte :
`docs/exemple-flux-google-merchant.xml` en fournit un.

Vous pouvez renseigner un `affiliate.param` / `affiliate.value` par enseigne : il est ajouté
aux liens sortants.

### Recherche en direct, en complément

Quand les catalogues chargés n'ont rien de pertinent pour un besoin, le modèle peut chercher
sur les sites des magasins : recherche web intégrée côté Claude, ancrage Google Search côté
Gemini, cadrés sur les domaines déclarés dans `config/stores.json`. Chaque produit porte une
mention `vérifié` ou `probable` selon que le prix vient d'une page réellement consultée.

```bash
CATALOG_LIVE_SEARCH=1 npm start
```

Elle est désactivée par défaut car chaque recherche consomme des jetons, et ne se déclenche
pendant une génération que sous le seuil `CATALOG_LIVE_MIN_RESULTS`.

### Le catalogue d'exemple

`server/catalog/data/seed-catalog.json` contient 32 produits génériques. Il ne sert que
lorsqu'**aucun** flux réel n'est chargé, pour que l'application reste utilisable à vide ; ses
prix sont marqués comme indicatifs et ses liens pointent vers la recherche du magasin, jamais
vers une référence inventée.

---


## Déploiement sur Vercel

Le dépôt est prêt à être importé tel quel : `public/` est servi en statique, `api/[...path].js`
expose l'API en fonction serverless, et `vercel.json` porte la configuration.

1. Sur [vercel.com/new](https://vercel.com/new), importez `Deiyox22/Chez-moi`.
2. Laissez le framework sur « Other ». Aucune commande de build n'est nécessaire.
3. Ajoutez les variables d'environnement dans **Settings → Environment Variables** :
   `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY`), et si vous le voulez `CATALOG_LIVE_SEARCH=1`.
4. Déployez.

En ligne de commande :

```bash
npm i -g vercel
vercel login
vercel link
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

### Déploiement automatique depuis GitHub

Le dépôt contient un workflow qui fait tout le travail : `.github/workflows/deploy-vercel.yml`.
Il vérifie le projet, crée et lie le projet Vercel, publie les variables d'environnement, puis
déploie en production. Deux secrets à créer une seule fois, dans
**Settings → Secrets and variables → Actions** :

| Secret | Où l'obtenir |
| --- | --- |
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Ensuite, chaque poussée sur la branche par défaut déploie. Vous pouvez aussi lancer le
déploiement à la main depuis l'onglet **Actions → Déployer sur Vercel → Run workflow**, en
choisissant `production` ou `preview`. L'URL du déploiement apparaît dans le résumé du job.

Les secrets ne quittent jamais GitHub : le workflow les transmet directement à Vercel, ils
n'apparaissent pas dans les journaux et ne transitent par aucun intermédiaire.

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
api/                    points d'entree serverless (Vercel), un par route
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

Trois appels modèle, chacun en **sortie structurée** validée contre un schéma JSON plutôt que
devinée dans du texte libre : `output_config.format` côté Claude, `responseJsonSchema` côté
Gemini. Les routes ne connaissent aucun des deux : elles assemblent des blocs neutres que
l'adaptateur du fournisseur traduit.

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
