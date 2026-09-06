/** JSON schemas used for the structured-output calls. */

export const FURNITURE_CATEGORIES = [
  'canape', 'fauteuil', 'chaise', 'pouf', 'table_basse', 'table_repas', 'bureau',
  'meuble_tv', 'bibliotheque', 'etagere', 'buffet', 'commode', 'armoire', 'rangement',
  'lit', 'tete_de_lit', 'chevet', 'matelas', 'miroir', 'tapis', 'rideaux', 'coussin',
  'plaid', 'luminaire_plafond', 'lampadaire', 'lampe_table', 'decoration_murale',
  'plante', 'electromenager', 'autre',
];

export const ROOM_TYPES = [
  'salon', 'chambre', 'cuisine', 'salle_a_manger', 'bureau', 'salle_de_bain',
  'entree', 'couloir', 'studio', 'chambre_enfant', 'buanderie', 'balcon', 'autre',
];

const colorSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Nom de la couleur en francais, ex: vert sapin' },
    hex: { type: 'string', description: 'Code hexadecimal approchant, ex: #2F5D4F' },
  },
  required: ['name', 'hex'],
  additionalProperties: false,
};

const dimensionsSchema = {
  type: 'object',
  description: 'Dimensions estimees en centimetres, deduites des proportions visibles.',
  properties: {
    largeurCm: { type: 'number' },
    profondeurCm: { type: 'number' },
    hauteurCm: { type: 'number' },
  },
  required: ['largeurCm', 'profondeurCm', 'hauteurCm'],
  additionalProperties: false,
};

export const furnitureSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'Un element par meuble ou objet de decoration nettement identifiable sur les photos.',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string', description: 'Nom court et concret, ex: canape 3 places en velours vert' },
          categorie: { type: 'string', enum: FURNITURE_CATEGORIES },
          styles: { type: 'array', items: { type: 'string' } },
          couleurs: { type: 'array', items: colorSchema },
          materiaux: { type: 'array', items: { type: 'string' } },
          dimensionsEstimeesCm: dimensionsSchema,
          etat: { type: 'string', enum: ['neuf', 'tres bon', 'bon', 'use', 'a renover'] },
          particularites: { type: 'array', items: { type: 'string' } },
          atouts: { type: 'string', description: "Ce que ce meuble apporte a un amenagement." },
          confiance: { type: 'number', description: 'Entre 0 et 1.' },
        },
        required: ['nom', 'categorie', 'styles', 'couleurs', 'materiaux', 'dimensionsEstimeesCm', 'etat', 'particularites', 'atouts', 'confiance'],
        additionalProperties: false,
      },
    },
    remarque: { type: 'string', description: "Remarque sur la qualite des photos, vide s'il n'y a rien a signaler." },
  },
  required: ['items', 'remarque'],
  additionalProperties: false,
};

export const roomSchema = {
  type: 'object',
  properties: {
    nomPropose: { type: 'string' },
    type: { type: 'string', enum: ROOM_TYPES },
    surfaceEstimeeM2: { type: 'number' },
    hauteurSousPlafondM: { type: 'number' },
    forme: { type: 'string' },
    luminosite: { type: 'string', enum: ['tres faible', 'faible', 'moyenne', 'forte', 'tres forte'] },
    orientationSupposee: { type: 'string' },
    fenetres: { type: 'integer' },
    portes: { type: 'integer' },
    sol: { type: 'string' },
    couleursMurs: { type: 'array', items: colorSchema },
    styleExistant: { type: 'string' },
    elementsFixes: { type: 'array', items: { type: 'string' }, description: 'Radiateur, cheminee, poutre, prise, arrivee d\'eau...' },
    contraintes: { type: 'array', items: { type: 'string' } },
    pointsForts: { type: 'array', items: { type: 'string' } },
    circulation: { type: 'string', description: 'Comment on traverse la piece aujourd\'hui.' },
  },
  required: ['nomPropose', 'type', 'surfaceEstimeeM2', 'hauteurSousPlafondM', 'forme', 'luminosite', 'orientationSupposee', 'fenetres', 'portes', 'sol', 'couleursMurs', 'styleExistant', 'elementsFixes', 'contraintes', 'pointsForts', 'circulation'],
  additionalProperties: false,
};

export const designSchema = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    resume: { type: 'string', description: '2 a 4 phrases decrivant l\'ambiance visee.' },
    directionStyle: { type: 'string' },
    palette: {
      type: 'array',
      description: '4 a 6 couleurs, de la dominante aux accents.',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          hex: { type: 'string' },
          usage: { type: 'string', description: 'Ou appliquer cette couleur.' },
        },
        required: ['nom', 'hex', 'usage'],
        additionalProperties: false,
      },
    },
    meublesReutilises: {
      type: 'array',
      description: 'Meubles deja possedes reintegres dans l\'amenagement.',
      items: {
        type: 'object',
        properties: {
          meubleId: { type: 'string' },
          libelle: { type: 'string' },
          emplacement: { type: 'string' },
          ajustement: { type: 'string', description: 'Relooking, changement de housse, deplacement... vide si rien a faire.' },
        },
        required: ['meubleId', 'libelle', 'emplacement', 'ajustement'],
        additionalProperties: false,
      },
    },
    meublesEcartes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          meubleId: { type: 'string' },
          libelle: { type: 'string' },
          raison: { type: 'string' },
          alternative: { type: 'string', description: 'Autre piece ou autre usage possible.' },
        },
        required: ['meubleId', 'libelle', 'raison', 'alternative'],
        additionalProperties: false,
      },
    },
    zones: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          fonction: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['nom', 'fonction', 'description'],
        additionalProperties: false,
      },
    },
    plan: {
      type: 'object',
      description: 'Plan vu de dessus. Origine en haut a gauche, unites en centimetres.',
      properties: {
        largeurCm: { type: 'number' },
        profondeurCm: { type: 'number' },
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              libelle: { type: 'string' },
              nature: { type: 'string', enum: ['possede', 'a_acheter', 'existant'] },
              meubleId: { type: 'string', description: 'Identifiant du meuble possede, vide sinon.' },
              xCm: { type: 'number' },
              yCm: { type: 'number' },
              largeurCm: { type: 'number' },
              profondeurCm: { type: 'number' },
              rotationDeg: { type: 'number' },
              note: { type: 'string' },
            },
            required: ['libelle', 'nature', 'meubleId', 'xCm', 'yCm', 'largeurCm', 'profondeurCm', 'rotationDeg', 'note'],
            additionalProperties: false,
          },
        },
      },
      required: ['largeurCm', 'profondeurCm', 'elements'],
      additionalProperties: false,
    },
    besoinsAchat: {
      type: 'array',
      description: 'Ce qu\'il manque pour completer, du plus utile au plus accessoire.',
      items: {
        type: 'object',
        properties: {
          besoin: { type: 'string' },
          categorie: { type: 'string' },
          requeteRecherche: { type: 'string', description: 'Mots-cles courts pour chercher ce produit dans un catalogue.' },
          styles: { type: 'array', items: { type: 'string' } },
          couleurs: { type: 'array', items: { type: 'string' } },
          budgetMaxEuros: { type: 'number' },
          priorite: { type: 'string', enum: ['essentiel', 'important', 'bonus'] },
          pourquoi: { type: 'string' },
        },
        required: ['besoin', 'categorie', 'requeteRecherche', 'styles', 'couleurs', 'budgetMaxEuros', 'priorite', 'pourquoi'],
        additionalProperties: false,
      },
    },
    eclairage: { type: 'array', items: { type: 'string' } },
    textiles: { type: 'array', items: { type: 'string' } },
    gainsRapides: { type: 'array', items: { type: 'string' }, description: 'Actions gratuites ou tres peu couteuses.' },
    etapes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ordre: { type: 'integer' },
          action: { type: 'string' },
          coutEstimeEuros: { type: 'number' },
        },
        required: ['ordre', 'action', 'coutEstimeEuros'],
        additionalProperties: false,
      },
    },
    budgetEstime: {
      type: 'object',
      properties: { min: { type: 'number' }, max: { type: 'number' }, devise: { type: 'string' } },
      required: ['min', 'max', 'devise'],
      additionalProperties: false,
    },
  },
  required: ['titre', 'resume', 'directionStyle', 'palette', 'meublesReutilises', 'meublesEcartes', 'zones', 'plan', 'besoinsAchat', 'eclairage', 'textiles', 'gainsRapides', 'etapes', 'budgetEstime'],
  additionalProperties: false,
};
