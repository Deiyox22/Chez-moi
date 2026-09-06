import { askForJson, imageBlocks } from '../lib/anthropic.js';
import { furnitureSchema, roomSchema, FURNITURE_CATEGORIES, ROOM_TYPES } from '../lib/schemas.js';

const FURNITURE_SYSTEM = `Tu es un architecte d'interieur qui inventorie le mobilier d'un particulier a partir de photos.

Regles :
- Ne decris que ce qui est reellement visible. N'invente ni marque, ni modele, ni prix.
- Un objet par entree. Ignore le desordre, les objets consommables et ce qui appartient manifestement au bati (radiateur, porte, fenetre).
- Estime les dimensions a partir des reperes de la photo (hauteur d'assise ~45 cm, plinthe ~10 cm, porte ~200 cm). Ce sont des estimations, pas des mesures.
- Donne des couleurs nommees en francais avec un code hexadecimal proche de ce que tu vois.
- Le champ "confiance" reflete honnetement ta certitude : 0.3 si la photo est floue ou l'objet partiellement cache.
- Reponds uniquement avec le JSON demande, en francais.

Categories autorisees : ${FURNITURE_CATEGORIES.join(', ')}.`;

const ROOM_SYSTEM = `Tu es un architecte d'interieur qui releve une piece a partir de photos avant de proposer un amenagement.

Regles :
- Estime la surface et la hauteur sous plafond a partir des reperes visibles (carrelage, lames de parquet, portes, prises). Reste prudent : une estimation large vaut mieux qu'un faux chiffre precis.
- Releve les elements fixes qui contraignent l'amenagement : radiateurs, cheminee, poutres, gaines, prises, arrivees d'eau, portes qui s'ouvrent vers l'interieur.
- "contraintes" = ce qui limite l'amenagement. "pointsForts" = ce sur quoi on peut s'appuyer.
- N'invente rien qui ne soit pas visible sur les photos.
- Reponds uniquement avec le JSON demande, en francais.

Types de piece autorises : ${ROOM_TYPES.join(', ')}.`;

export async function analyzeFurniture(body) {
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  if (!images.length) {
    const error = new Error('Envoyez au moins une photo du meuble.');
    error.status = 400;
    throw error;
  }

  const hint = String(body.hint || '').slice(0, 500);
  const content = [
    ...imageBlocks(images),
    {
      type: 'text',
      text: [
        images.length > 1
          ? `Voici ${images.length} photos. Elles peuvent montrer le meme meuble sous plusieurs angles : dans ce cas, ne cree qu'une seule entree.`
          : 'Voici une photo du mobilier a inventorier.',
        hint ? `Precision donnee par la personne : ${hint}` : '',
        'Inventorie les meubles et objets de decoration marquants.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const { data, usage } = await askForJson({
    system: FURNITURE_SYSTEM,
    content,
    schema: furnitureSchema,
    maxTokens: 8000,
    effort: 'medium',
  });
  return { ...data, usage };
}

export async function analyzeRoom(body) {
  const images = Array.isArray(body.images) ? body.images.slice(0, 6) : [];
  if (!images.length) {
    const error = new Error('Envoyez au moins une photo de la piece.');
    error.status = 400;
    throw error;
  }

  const givenName = String(body.name || '').slice(0, 120);
  const notes = String(body.notes || '').slice(0, 800);
  const content = [
    ...imageBlocks(images),
    {
      type: 'text',
      text: [
        `Voici ${images.length} photo(s) d'une piece a analyser.`,
        givenName ? `Nom donne par la personne : ${givenName}. Reprends-le dans "nomPropose" s'il est coherent.` : "Aucun nom n'a ete donne : propose-en un a partir de ce que tu vois.",
        notes ? `Notes complementaires : ${notes}` : '',
        'Fais le releve de la piece.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const { data, usage } = await askForJson({
    system: ROOM_SYSTEM,
    content,
    schema: roomSchema,
    maxTokens: 8000,
    effort: 'medium',
  });
  return { ...data, usage };
}
