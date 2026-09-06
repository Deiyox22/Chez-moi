import { askForJson, imageBlocks } from '../lib/anthropic.js';
import { designSchema } from '../lib/schemas.js';
import { searchProducts, loadCatalog } from '../catalog/store.js';

const DESIGN_SYSTEM = `Tu es architecte d'interieur. Tu proposes l'amenagement d'une piece a un particulier qui possede deja du mobilier.

Principe directeur : partir de ce que la personne possede. Le mobilier existant est le point de depart du projet, pas une contrainte a contourner. Tu ne proposes un achat que lorsqu'aucun meuble possede ne peut remplir la fonction.

Regles :
- Reutilise en priorite les meubles de l'inventaire, y compris dans un autre role que leur usage actuel. Explique ou les placer et pourquoi.
- Ecarte un meuble uniquement avec une raison concrete (proportions, style irreconciliable, circulation), et propose-lui une autre destination.
- Le plan est vu de dessus, en centimetres, origine en haut a gauche. Laisse au moins 70 cm de passage dans les zones de circulation et 40 cm entre un canape et une table basse. Les elements ne doivent pas se chevaucher et doivent tenir dans les dimensions de la piece.
- "besoinsAchat" contient de vrais manques, pas une liste de courses. Cite la fonction manquante, pas une marque. La requete de recherche doit etre courte et generique (ex : "tapis laine 200x300 ecru").
- Respecte le budget indique. Si le budget est serre, privilegie les gains rapides gratuits : deplacer, degager, changer l'eclairage, harmoniser les textiles.
- Reste realiste : pas de renovation lourde sauf demande explicite.
- Reponds uniquement avec le JSON demande, en francais.`;

function buildContext({ room, furniture, preferences }) {
  const inventory = (furniture || []).map((item) => ({
    id: item.id,
    nom: item.nom,
    categorie: item.categorie,
    styles: item.styles,
    couleurs: (item.couleurs || []).map((color) => color.name || color.nom).filter(Boolean),
    materiaux: item.materiaux,
    dimensionsCm: item.dimensionsEstimeesCm,
    etat: item.etat,
    particularites: item.particularites,
  }));

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
function attachProducts(design, preferences) {
  const catalog = loadCatalog();
  const wantedStores = Array.isArray(preferences?.stores) && preferences.stores.length ? preferences.stores : null;

  const shopping = (design.besoinsAchat || []).map((need) => {
    const maxPrice = need.budgetMaxEuros || preferences?.budget || null;
    let products = searchProducts({
      query: need.requeteRecherche || need.besoin,
      category: need.categorie,
      maxPrice,
      styles: need.styles || [],
      colors: need.couleurs || [],
      limit: 4,
    });
    if (wantedStores) {
      const preferred = products.filter((product) => wantedStores.includes(product.store));
      if (preferred.length) products = preferred;
    }
    return { ...need, produits: products };
  });

  return {
    ...design,
    besoinsAchat: shopping,
    catalogue: {
      magasinsAvecFluxReel: catalog.sources.filter((source) => source.type === 'feed').map((source) => source.store),
      utiliseCatalogueExemple: catalog.sources.some((source) => source.type === 'exemple'),
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
  const content = [
    ...imageBlocks(images),
    {
      type: 'text',
      text: [
        images.length ? `Voici ${images.length} photo(s) de la piece a amenager.` : "Aucune photo n'est jointe : appuie-toi uniquement sur le releve ci-dessous.",
        '',
        'Contexte du projet (JSON) :',
        JSON.stringify(context, null, 2),
        '',
        "Propose un amenagement complet de cette piece qui reutilise au maximum le mobilier possede.",
      ].join('\n'),
    },
  ];

  const { data, usage } = await askForJson({
    system: DESIGN_SYSTEM,
    content,
    schema: designSchema,
    maxTokens: 16000,
  });

  return { ...attachProducts(data, body.preferences), usage };
}
