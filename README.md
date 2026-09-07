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
| **Envies** | Un produit repéré au catalogue s'ajoute à vos meubles dans une catégorie à part, « envies d'achat ». L'aménagement le place comme un meuble à acquérir et ne propose plus rien d'autre à sa place. |
| **Montage** | Les meubles sont détourés et posés sur votre photo, à leurs proportions réelles, déplaçables au doigt. Gratuit, hors ligne, illimité. Vos propres photos sont détourées par un modèle qui tourne sur votre appareil. |
| **Moteur** | Le calage du sol livre la caméra de votre photo : les meubles y sont dressés en perspective juste, avec leur ombre portée et leur encombrement au sol. |
| **Rendu** | Pour la belle image : votre photo et celles des meubles retenus sont confiées à un modèle d'image, qui rend la pièce une fois aménagée. |
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

### Le montage, gratuit et illimité

Avant tout appel facturé, l'aménagement propose un **montage** : votre photo de pièce en fond,
les meubles du projet détourés et posés dessus, déplaçables au doigt. Tout se calcule dans le
navigateur — aucun appel réseau facturé, et rien n'empêche de recommencer vingt fois.

Le détourage tire parti d'une régularité des fiches boutique : elles sont sur fond uni. Une
propagation depuis les bords efface le fond tant que la couleur ne bouge pas, avec un
adoucissement des contours. Quand les coins ne se ressemblent pas, ou quand la propagation
mangerait presque toute l'image, le montage renonce et pose le produit tel quel plutôt que de
le trouer.

#### Vos propres photos : la segmentation embarquée

Cette régularité n'existe pas pour vos photos : un meuble à vous est photographié dans une
pièce, devant un mur, un tapis, d'autres meubles. Aucune propagation depuis les bords n'en
viendra à bout. La question à poser n'est d'ailleurs pas « où est le fond » mais « où est le
sujet », et c'est exactement ce que fait un modèle de **détection d'objet saillant**.

L'application embarque donc **U²-Net-p** (4,4 Mo) exécuté par **ONNX Runtime Web** en
WebAssembly, tous deux servis depuis le domaine de l'application plutôt qu'un CDN : le
détourage marche hors ligne, et surtout **vos photos ne quittent jamais l'appareil** — il n'y
a pas d'appel réseau à faire, donc rien à envoyer et rien à facturer.

Le modèle travaille en 320×320 avec la normalisation d'ImageNet ; le masque produit est étalé
entre 0 et 255 puis agrandi par le navigateur à la taille de la photo, dont il devient le canal
alpha. Un seul fil d'exécution : les fils demanderaient l'isolation d'origine, qui casserait le
chargement des images de boutique.

Mesuré sur un meuble replacé sur un fond volontairement chargé, masque de référence à l'appui :
**99,7 % de recouvrement**, environ 2 secondes par photo une fois le modèle chargé, et 19 Mo à
télécharger la toute première fois. Ces 19 Mo vivent dans un cache que la mise à jour de
l'application ne vide pas, et les réglages disent s'ils sont là et permettent de les rendre.

#### Le calage du sol

Un collage se trahit toujours par la même chose : le meuble garde sa taille où qu'on le pose,
alors qu'il devrait rétrécir en s'éloignant. Le montage règle ça par une **homographie du plan
du sol**.

Une photo perd la profondeur, mais pas complètement : un plan de la scène — ici le sol — reste
lié à l'image par une transformation projective à huit paramètres, et quatre correspondances
suffisent à la retrouver. Vous marquez donc une fois un rectangle posé à plat sur le sol — un
tapis, un carrelage, un coin de pièce — et vous donnez ses dimensions réelles. À partir de là,
l'application sait où tombe dans l'image n'importe quel point du sol, et combien de pixels y
vaut un centimètre.

Un meuble est alors posé à des coordonnées en centimètres dans la pièce, plus en pixels dans
l'image. Le déplacer vers le fond le rétrécit tout seul, et l'ordre d'occultation suit la
profondeur sans qu'on s'en occupe. Mesuré : un fauteuil passe de 449 px au premier plan à
271 px à deux mètres cinquante, soit le rapport que la perspective impose.

Sans calage, le montage reste utilisable : les meubles gardent une taille constante, et leurs
proportions **entre eux** restent exactes puisque chacun est dessiné à sa largeur réelle. Le
calage n'ajoute que la profondeur.

#### Le moteur : la caméra de votre photo, retrouvée

L'homographie ne parle que du sol. Elle fait rétrécir un meuble qu'on éloigne, mais elle ignore
la hauteur : les arêtes verticales du meuble restent parallèles alors que celles de la pièce
convergent. C'est le dernier détail qui trahit le collage.

Or une homographie de plan en dit bien plus qu'elle n'en a l'air. Elle vaut `K·[r1 r2 t]` à un
facteur près — deux colonnes d'une rotation et une translation, vues à travers la matrice
interne de l'appareil. Comme `r1` et `r2` sont unitaires et orthogonaux, deux équations
tombent et il ne reste qu'une inconnue, la focale. On la résout, on complète la rotation par
`r3 = r1 × r2`, et **la caméra qui a pris la photo est reconstituée** : position, orientation,
champ. Le calage du sol livrait donc la caméra depuis le début, sans qu'on le sache.

À partir de là on ne projette plus le sol, on projette la pièce. Chaque meuble devient un
objet à une position en centimètres, avec une orientation et un encombrement ; sa photo
détourée est plaquée sur un panneau dressé à cet endroit. Un meuble n'est pas plat, et c'est
une approximation — mais elle est juste là où l'œil regarde : la ligne de contact avec le sol,
la hauteur apparente, la fuite des verticales.

Ce que le moteur ajoute, concrètement :

- **Les verticales fuient.** Vérifié : les arêtes verticales de cinq meubles posés et pivotés
  au hasard se coupent toutes en un seul point de fuite, à 5·10⁻¹¹ pixel près.
- **Les ombres sont des silhouettes, pas des ellipses.** L'ombre d'un meuble est sa propre
  découpe aplatie sur le sol depuis la direction de la lumière, orientable au doigt. Pour
  85 cm de haut et une lumière à 54° d'élévation, elle mesure 62 cm — exactement `85/tan 54°`.
- **L'encombrement est visible.** Le meuble sélectionné montre sa boîte en fil de fer et son
  emprise au sol ; deux meubles qui se marchent dessus passent au rouge. La question « est-ce
  que ça rentre » a enfin une réponse.
- **Rien n'est déformé.** Quand les cotes du fabricant et le cadrage de la photo se
  contredisent, l'image garde ses proportions et l'écart est réparti sur l'échelle — moyenne
  géométrique des deux largeurs possibles, qui redonne la cote annoncée quand les deux
  s'accordent.

La rasterisation tient en un shader WebGL de six lignes, sans aucune bibliothèque. Plaquer une
image dans un quadrilatère quelconque est justement ce que le canvas 2D ne sait pas faire ; il
suffit d'écrire `gl_Position` avec le `w` de la projection pour que la carte graphique rétablisse
d'elle-même l'interpolation perspective. Sans WebGL, l'application reste en collage à plat et
le dit.

Reste une approximation assumée : le panneau est plat, et la focale se déduit du repère que
vous avez posé. Sur un repère placé au doigt à ±5 pixels près, le haut d'un meuble tombe à
10 pixels de sa vraie place sur une photo de 1400 px — invisible ; à ±20 pixels, 35 pixels.
Quand le repère ne permet pas de mesurer la focale, un objectif courant est supposé et
l'application le signale.

Les images produit sont servies par un **relais** côté serveur, sans quoi le navigateur ne
pourrait pas lire leurs pixels. Ce relais n'accepte que les URL déjà présentes dans le
catalogue : il ne peut pas servir de proxy ouvert.

Le montage n'est pas un rendu photoréaliste, et ne prétend pas l'être : pas d'ombres portées
justes, pas de perspective. Il répond à « est-ce que ce meuble tient là, à cette taille, avec
ces couleurs », ce qui est la question qu'on se pose le plus souvent.

### Le rendu photographique

Le plan dit où va quoi, mais il ne donne pas envie. Depuis la fiche d'un aménagement, un bouton
compose une **photographie de votre pièce réaménagée** : votre photo part en première image,
suivie des photos des meubles retenus — les vôtres quand vous les avez photographiés, celles
de la boutique pour les envies d'achat — et le modèle installe les seconds dans la première.
La consigne insiste sur deux points : la pièce garde ses murs, ses fenêtres et son point de
vue, et les meubles gardent leur forme et leur couleur, pour que le rendu montre vos meubles
et non des meubles ressemblants.

Cette fonction demande une clé **Gemini** : c'est le seul des deux fournisseurs à proposer un
modèle d'image ici. Le rendu est conservé avec l'aménagement et signalé comme une
illustration — **les cotes du plan font foi, pas l'image**.

#### Ce que ça coûte

C'est le seul poste de dépense notable, et de loin. Les appels texte sont minuscules : mesurés
avec `countTokens`, une analyse de meuble fait 264 jetons en entrée, un relevé de pièce 784,
une génération d'aménagement 1 525. Aux tarifs de `gemini-2.5-flash`, un projet complet — dix
meubles photographiés, une pièce, un aménagement — revient à **environ deux centimes**. Et ce
modèle a un palier gratuit : en restant dans ses limites de débit, cette partie ne coûte rien.

Un rendu, lui, se facture à l'image, sans palier gratuit :

| Modèle | Prix par image | |
| --- | --- | --- |
| `gemini-2.5-flash-image` | ~0,036 € | **défaut** |
| `gemini-3.1-flash-image` | ~0,062 € (1K) | plus fin |
| `gemini-3-pro-image` | ~0,124 € (1K/2K) | le plus abouti |

Un rendu coûte donc entre deux et six fois le reste du projet réuni. L'application l'annonce
avant de le lancer, ne le génère jamais d'elle-même, et conserve celui obtenu plutôt que de le
refaire. Tarifs relevés sur la [grille Google](https://ai.google.dev/gemini-api/docs/pricing),
à vérifier avant de vous y fier.

Dernier point pratique : sur Vercel la fonction est plafonnée à 60 secondes ; si un rendu
dépasse, un modèle plus rapide règle le problème.

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
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image` | Modèle d'image pour le rendu des aménagements. |
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

**Douze catalogues sont chargés, soit environ 4 200 produits**, avec vrais titres, vrais prix,
vraies photos et lien direct vers la fiche produit :

| Enseigne | Ce qu'on y trouve | Comment |
| --- | --- | --- |
| [Hartô](https://harto.fr) | mobilier design | flux Shopify |
| [Maison Sarah Lavoine](https://maisonsarahlavoine.com) | mobilier et décoration | flux Shopify |
| [Honoré Déco](https://honoredeco.com) | décoration et assises | flux Shopify |
| [Tediber](https://tediber.com) | literie | flux Shopify |
| [IKEA](https://www.ikea.com/fr/fr/) | mobilier et décoration | sitemap + schema.org |
| [Habitat](https://www.habitat.fr) | mobilier | sitemap + schema.org |
| [Camif](https://www.camif.fr) | mobilier français et éco-conçu | sitemap + schema.org |
| [FLY](https://fly.fr) | mobilier grand public | sitemap + schema.org |
| [Vente-unique](https://www.vente-unique.com) | mobilier grand public | sitemap + schema.org |
| [Westwing](https://www.westwing.fr) | décoration et textile | sitemap + schema.org |
| [Silvera](https://www.silvera.fr) | mobilier haut de gamme | sitemap + schema.org |
| [Zago](https://www.zago-store.com) | mobilier design | flux Shopify |

Aucun compte, aucune clé, aucune extraction de page : soit le point d'accès `/products.json`
que ces boutiques exposent publiquement, soit le sitemap et les données schema.org que les
enseignes publient à destination des moteurs de recherche.

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

Cinq formats de flux sont reconnus : `shopify`, `sitemap-jsonld`, `google-merchant-xml`,
`csv`, `json`.

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

Aucune ne publie d'API produit ouverte, mais elles ne se valent pas toutes face à un accès
automatisé, et chacune a été vérifiée plutôt que supposée.

**IKEA, Habitat, Camif, FLY, Vente-unique, Westwing et Silvera sont connectées.** Leur
`robots.txt` est lisible et n'interdit pas les fiches produit, leur sitemap produits est
public, et leurs pages portent des données schema.org. C'est exactement le mécanisme que les sites publient *à destination* des moteurs
de recherche et des comparateurs, et le lecteur `sitemap-jsonld` l'utilise comme tel :

- `robots.txt` est lu en premier et ses règles `Disallow` sont respectées ;
- les requêtes sont sérialisées avec un délai, jamais parallélisées ;
- l'agent utilisateur dit qui appelle et renvoie vers ce dépôt ;
- le nombre de pages est plafonné et **équilibré par catégorie** grâce au type de produit lu
  dans l'URL, ce qui évite de balayer tout le site pour obtenir un catalogue représentatif ;
- les variantes d'un même produit sont écartées **avant** téléchargement, pour que le budget de
  pages achète des produits distincts ;
- cinq refus consécutifs arrêtent l'import.

**BUT, Leroy Merlin, Conforama, Maisons du Monde, La Redoute et Alinéa répondent HTTP 403** aux
requêtes automatisées, par pare-feu applicatif. C'est un refus explicite, et il est respecté :
ces enseignes restent désactivées, avec la raison inscrite dans `config/stores.json` et
affichée dans l'écran Magasins. Pour les brancher, il faut le flux produit qu'elles réservent
à leurs partenaires (Google Merchant, export CSV d'affiliation, accord direct) : renseignez
`feed.url` et passez `enabled` à `true`.

Un flux peut aussi être un **fichier local**, ce qui permet d'essayer l'import sans compte :
`docs/exemple-flux-google-merchant.xml` en fournit un.

Vous pouvez renseigner un `affiliate.param` / `affiliate.value` par enseigne : il est ajouté
aux liens sortants.

### Des envies d'achat, à côté des meubles possédés

Chaque carte produit porte un bouton d'ajout. Le produit rejoint alors **Mes meubles**, mais
dans une section distincte : « Envies d'achat », séparée de « Ce que je possède ». La
différence compte au moment de générer un aménagement — le mobilier possédé reste le point de
départ, tandis qu'une envie est traitée comme un choix déjà fait : elle est placée dans le
plan comme un meuble à acquérir, et rien d'autre n'est proposé pour la même fonction. Si elle
ne convient pas à la pièce, le modèle doit le dire plutôt que de l'ignorer.

Les dimensions sont lues dans le titre du produit quand elles y figurent — « Tapis 240x160 »,
« L.180 x P.90 x H.75 » — pour que le plan puisse le placer à l'échelle. Une fois l'achat
fait, un bouton déplace la fiche vers les meubles possédés.

### Parcourir le catalogue

L'onglet **Catalogue** ouvre sur une vitrine plutôt que sur un champ vide : une rangée de
**rayons** illustrés menant aux catégories les plus fournies, puis des **sélections** prêtes à
parcourir — pour le salon, la chambre, les repas, le travail, la lumière, et moins de 100 € —
chacune avec un « Voir tout » qui applique le filtre correspondant. Le catalogue entier suit
en dessous.

Dès qu'un filtre ou une recherche est actif, la vitrine s'efface au profit des seuls résultats,
et un bouton « Tout effacer » y ramène. Quatre façons de restreindre :

- **Magasins** : une puce par catalogue connecté, dans une rangée qui défile. Le choix est
  conservé d'une visite à l'autre, et la recherche en direct sur les sites le respecte aussi.
- **Rayon** : les catégories réellement présentes, avec leur nombre de produits, recalculées
  à chaque filtre.
- **Tri** : pertinence, prix croissant, prix décroissant, nom.
- **Prix** : un minimum et un maximum.

Les résultats se chargent par pages de 24 en **défilement infini**, avec le total affiché.
Deux mécanismes se relaient : une sentinelle observée sous la grille, et une vérification de
proximité du bas qui rattrape les défilements rapides, où la sentinelle peut être franchie
entre deux images sans jamais être vue. Sans `IntersectionObserver`, un bouton prend le relais.

Deux détails d'ordonnancement méritent d'être connus. À l'ouverture, les catégories qui
meublent vraiment une pièce passent devant les serviettes de table, et les résultats sont
répartis entre magasins et rayons pour éviter d'ouvrir sur six coloris du même meuble. Dès
qu'un terme est tapé, en revanche, le classement redevient purement celui de la pertinence :
une question mérite une réponse, pas un panachage.

Au moment de générer un aménagement, la même sélection de magasins est proposée : les achats
suggérés ne viendront alors que des enseignes choisies. Sans sélection, tous les catalogues
sont interrogés.

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
