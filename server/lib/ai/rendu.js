/**
 * Photographic staging: the room as it is, plus the furniture chosen for it,
 * handed to an image model that puts the second inside the first.
 *
 * This is the one thing neither the plan nor the moodboard can do — and the one
 * thing that must never be mistaken for a measurement. What comes out is an
 * illustration; the plan's centimetres remain the reference.
 */
import { getClient } from './gemini.js';
import { config } from '../../config.js';

const MAX_REFERENCES = 6;
const TAILLE_MAX_REFERENCE = 4_000_000; // 4 Mo par image de reference

const SYSTEME = `Tu es un photographe d'interieur. On te donne la photo d'une piece reelle, puis les photos des meubles a y installer.

Regles :
- Conserve la piece : ses murs, ses fenetres, son sol, ses proportions et son point de vue restent ceux de la photo d'origine. Tu remeubles, tu ne redessines pas la piece.
- Utilise les meubles fournis tels qu'ils sont : leur forme, leur matiere et leur couleur doivent rester reconnaissables. N'invente pas un meuble a la place d'un autre.
- Respecte l'echelle et la circulation : un canape ne bouche pas une porte, un tapis passe sous les pieds, rien ne flotte.
- Garde la lumiere naturelle de la piece d'origine, et une photographie sobre et realiste, sans texte ni filigrane.`;

function partieImage(image) {
  return { inlineData: { mimeType: image.media_type || 'image/jpeg', data: image.data } };
}

/** Reference photos live on the shops' CDNs; they are fetched and inlined. */
async function telechargerReference(url) {
  try {
    const reponse = await fetch(url, { headers: { 'user-agent': 'chez-moi/0.1' }, redirect: 'follow' });
    if (!reponse.ok) return null;
    const type = reponse.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    const donnees = Buffer.from(await reponse.arrayBuffer());
    if (donnees.byteLength > TAILLE_MAX_REFERENCE) return null;
    return { inlineData: { mimeType: type.split(';')[0], data: donnees.toString('base64') } };
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {{media_type: string, data: string}} options.piece   photo de la piece
 * @param {Array<{titre: string, imageUrl?: string, image?: object}>} options.meubles
 * @param {string} [options.consignes] direction de style issue de l'amenagement
 */
export async function rendreLaPiece({ piece, meubles = [], consignes = '' }) {
  if (!piece?.data) {
    const erreur = new Error("Aucune photo de piece n'a ete transmise.");
    erreur.status = 400;
    throw erreur;
  }

  const references = [];
  const legendes = [];
  for (const meuble of meubles.slice(0, MAX_REFERENCES)) {
    const partie = meuble.image ? partieImage(meuble.image) : meuble.imageUrl ? await telechargerReference(meuble.imageUrl) : null;
    if (!partie) continue;
    references.push(partie);
    legendes.push(`${legendes.length + 1}. ${meuble.titre}`);
  }

  const texte = [
    'Voici la piece a remeubler (premiere image).',
    references.length
      ? `Les images suivantes sont les meubles a y installer :\n${legendes.join('\n')}`
      : "Aucune photo de meuble n'est fournie : reamenage la piece avec du mobilier coherent avec la direction indiquee.",
    consignes ? `\nDirection souhaitee : ${consignes}` : '',
    '\nRends une photographie de cette piece une fois amenagee.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const ai = getClient();
  const reponse = await ai.models.generateContent({
    model: config.ai.imageModel,
    contents: [{ role: 'user', parts: [partieImage(piece), ...references, { text: texte }] }],
    config: { systemInstruction: SYSTEME, responseModalities: ['IMAGE'] },
  });

  const parties = reponse.candidates?.[0]?.content?.parts || [];
  const image = parties.find((partie) => partie.inlineData?.data);
  if (!image) {
    const raison = reponse.candidates?.[0]?.finishReason;
    const erreur = new Error(
      raison && raison !== 'STOP'
        ? `Le modele n'a pas produit d'image (${raison}). Reessayez avec une autre photo de piece.`
        : "Le modele n'a renvoye aucune image."
    );
    erreur.status = 502;
    throw erreur;
  }

  return {
    image: { media_type: image.inlineData.mimeType || 'image/png', data: image.inlineData.data },
    meublesUtilises: legendes.length,
    modele: config.ai.imageModel,
  };
}
