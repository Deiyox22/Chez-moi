import { askForJson, imageParts, textPart } from '../lib/ai/index.js';
import { designSchema } from '../lib/schemas.js';
import { searchProducts, loadCatalog, loadStores } from '../catalog/store.js';
import { searchLiveProducts } from '../catalog/providers/websearch.js';
import { config } from '../config.js';

const DESIGN_SYSTEM = `Tu es architecte d'interieur. Tu proposes l'amenagement d'une piece a un particulier qui possede deja du mobilier.

Principe directeur : partir de ce que la personne possede. Le mobilier existant est le point de depart du projet, pas une contrainte a contourner. Tu ne proposes un achat que lorsqu'aucun meuble possede ne peut remplir la fonction.

Regles :
- Reutilise en priorite les meubles de l'inventaire, y compris dans un autre role que leur usage actuel. Explique ou les placer et pourquoi.
- "enviesDAchat" liste des produits que la personne a elle-meme reperes en boutique. Traite-les comme deja choisis : place-les dans le plan avec la nature "a_acheter", cite-les dans meublesReutilises avec leur identifiant, et ne propose surtout pas d'autre produit pour la meme fonction. S'ils ne conviennent pas, dis-le franchement dans meublesEcartes plutot que de les ignorer.
- Ecarte un meuble uniquement avec une raison concrete (proportions, style irreconciliable, circulation), et propose-lui une autre destination.
- Le plan est vu de dessus, en centimetres, origine en haut a gauche. Laisse au moins 70 cm de passage dans les zones de circulation et 40 cm entre un canape et une table basse. Les elements ne doivent pas se chevaucher et doivent tenir dans les dimensions de la piece.
- "besoinsAchat" contient de vrais manques, pas une liste de courses. Cite la fonction manquante, pas une marque. La requete de recherche doit etre courte et generique (ex : "tapis laine 200x300 ecru").
- Respecte le budget indique. Si le budget est serre, privilegie les gains rapides gratuits : deplacer, degager, changer l'eclairage, harmoniser les textiles.
- Reste realiste : pas de renovation lourde sauf demande explicite.
- Reponds uniquement avec le JSON demande, en francais.`;

function buildContext({ room, furniture, preferences }) {
  const decrire = (item) => ({
    id: item.id,
    nom: item.nom,
    categorie: item.categorie,
    styles: item.styles,
    couleurs: (item.couleurs || []).map((color) => color.name || color.nom).filter(Boolean),
    materiaux: item.materiaux,
    dimensionsCm: item.dimensionsEstimeesCm,
    etat: item.etat,
    particularites: item.particularites,
    ...(item.boutique ? { boutique: item.boutique } : {}),
  });

  const tous = furniture || [];
  const inventory = tous.filter((item) => (item.statut || 'possede') === 'possede').map(decrire);
  const envies = tous.filter((item) => item.statut === 'a_acheter').map(decrire);

  return {
    piece: {
      nom: room?.nom || room?.nomPropose || 'Piece',
      type: room?.type,
      surfaceEstimeeM2: room?.surfaceEstimeeM2,
      hauteurSousPlafondM: room?.hauteurSousPlafondM,
      forme: room?.forme,
      luminosite: room?.luminosite,
      fenetres: room?.fenetres,
      portes: room?.portes,
      sol: room?.sol,
      couleursMurs: room?.couleursMurs,
      styleExistant: room?.styleExistant,
      elementsFixes: room?.elementsFixes,
      contraintes: room?.contraintes,
      pointsForts: room?.pointsForts,
      circulation: room?.circulation,
    },
    mobilierPossede: inventory,
    enviesDAchat: envies,
    preferences: {
      styleSouhaite: preferences?.style || 'a deduire des meubles possedes',
      budgetMaxEuros: preferences?.budget ?? null,
      usages: preferences?.usages || [],
      aEviter: preferences?.avoid || [],
      personnes: preferences?.household || '',
      animaux: preferences?.pets || false,
      enfants: preferences?.children || false,
      locataire: preferences?.renting || false,
      notes: preferences?.notes || '',
    },
  };
}

/** Attaches catalogue products to each shopping need returned by the model. */
async function attachProducts(design, preferences) {
  const catalog = loadCatalog();
  const wantedStores = Array.isArray(preferences?.stores) && preferences.stores.length ? preferences.stores : null;
  const stores = loadStores();
  const liveWanted = config.catalog.liveSearch;
  let liveUsed = false;

  const shopping = [];
  for (const need of design.besoinsAchat || []) {
    const maxPrice = need.budgetMaxEuros || preferences?.budget || null;
    // The store filter belongs inside the search: filtering the top four
    // results afterwards nearly always left nothing.
    const products = searchProducts({
      query: need.requeteRecherche || need.besoin,
      category: need.categorie,
      stores: wantedStores || [],
      maxPrice,
      styles: need.styles || [],
      colors: need.couleurs || [],
      limit: 4,
    });

    // Thin local results are exactly where a live lookup on the store sites earns its cost.
    let live = [];
    if (liveWanted && products.length < config.catalog.liveSearchMinResults) {
      try {
        live = await searchLiveProducts({
          query: need.requeteRecherche || need.besoin,
          maxPrice,
          styles: need.styles || [],
          colors: need.couleurs || [],
          stores: wantedStores ? stores.filter((store) => wantedStores.includes(store.id)) : stores,
          limit: 4,
        });
        if (live.length) liveUsed = true;
      } catch (error) {
        console.error('[catalogue] recherche en ligne indisponible :', error.message);
      }
    }

    shopping.push({ ...need, produits: products, produitsEnLigne: live });
  }

  return {
    ...design,
    besoinsAchat: shopping,
    catalogue: {
      magasinsAvecFluxReel: catalog.sources.filter((source) => source.type === 'feed').map((source) => source.store),
      utiliseCatalogueExemple: catalog.sources.some((source) => source.type === 'exemple'),
      rechercheEnLigne: liveUsed,
    },
  };
}

export async function createDesign(body) {
  const room = body.room;
  if (!room) {
    const error = new Error("Aucune piece n'a ete transmise.");
    error.status = 400;
    throw error;
  }

  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  const context = buildContext(body);
  const parts = [
    ...imageParts(images),
    textPart(
      [
        images.length ? `Voici ${images.length} photo(s) de la piece a amenager.` : "Aucune photo n'est jointe : appuie-toi uniquement sur le releve ci-dessous.",
        '',
        'Contexte du projet (JSON) :',
        JSON.stringify(context, null, 2),
        '',
        "Propose un amenagement complet de cette piece qui reutilise au maximum le mobilier possede.",
      ].join('\n')
    ),
  ];

  const { data, usage } = await askForJson({
    system: DESIGN_SYSTEM,
    parts,
    schema: designSchema,
    maxTokens: 16000,
  });

  return { ...(await attachProducts(data, body.preferences)), usage };
}
