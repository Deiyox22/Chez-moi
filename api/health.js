/**
 * Point d'entree serverless. Vercel associe ce fichier a la route de meme chemin ;
 * toute la logique vit dans server/handler.js, partagee avec le serveur local.
 */
import { handleRequest } from '../server/handler.js';

export default function handler(req, res) {
  return handleRequest(req, res, { staticFiles: false });
}
