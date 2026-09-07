import { rendreLaPiece } from '../lib/ai/rendu.js';
import { config, aiConfigured } from '../config.js';

export async function createRender(body) {
  if (!aiConfigured()) {
    const erreur = new Error("Aucune cle d'IA n'est configuree sur le serveur.");
    erreur.status = 503;
    erreur.code = 'ai_not_configured';
    throw erreur;
  }
  if (!config.ai.imageAvailable) {
    const erreur = new Error(
      "Le rendu photographique demande un modele d'image, disponible avec une cle Gemini. Renseignez GEMINI_API_KEY."
    );
    erreur.status = 501;
    erreur.code = 'image_non_disponible';
    throw erreur;
  }

  const images = Array.isArray(body.images) ? body.images : [];
  return rendreLaPiece({
    piece: images[0],
    meubles: Array.isArray(body.meubles) ? body.meubles : [],
    consignes: String(body.consignes || '').slice(0, 600),
  });
}
