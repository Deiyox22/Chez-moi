/**
 * Détourage par modèle, dans le navigateur.
 *
 * Le détourage par propagation de couleur ne marche que sur fond uni : il
 * couvre les fiches boutique, pas vos propres photos, prises dans une pièce.
 * U²-Net répond à la question différemment — il cherche le sujet saillant de
 * l'image plutôt que son fond — ce qui convient exactement à un meuble
 * photographié seul.
 *
 * Tout s'exécute sur l'appareil : les photos ne partent nulle part, et une fois
 * le modèle en cache l'opération est gratuite et illimitée.
 */

const RUNTIME = '/vendor/onnxruntime/ort.wasm.bundle.min.mjs';
const DOSSIER_WASM = '/vendor/onnxruntime/';
const MODELE = '/modeles/u2netp.onnx';
const COTE = 320; // U²-Net travaille sur des carrés de 320 pixels

// Normalisation d'ImageNet, celle avec laquelle le modèle a été entraîné.
const MOYENNE = [0.485, 0.456, 0.406];
const ECART = [0.229, 0.224, 0.225];

let sessionPromise = null;

/** Poids à télécharger la première fois, en octets, pour l'annoncer. */
export const POIDS_APPROXIMATIF = 19 * 1024 * 1024;

async function ouvrirSession(surAvancement) {
  const ort = await import(RUNTIME);
  ort.env.wasm.wasmPaths = DOSSIER_WASM;
  // Les fils d'exécution demanderaient l'isolation d'origine, qui casserait le
  // chargement des images de boutique. Un seul fil suffit ici.
  ort.env.wasm.numThreads = 1;
  ort.env.logLevel = 'error';
  surAvancement?.('runtime');

  const session = await ort.InferenceSession.create(MODELE, { executionProviders: ['wasm'] });
  surAvancement?.('modele');
  return { ort, session };
}

/** Charge runtime et modèle une seule fois, puis les réutilise. */
export function preparerSegmentation(surAvancement) {
  if (!sessionPromise) {
    sessionPromise = ouvrirSession(surAvancement).catch((erreur) => {
      sessionPromise = null;
      throw erreur;
    });
  }
  return sessionPromise;
}

export const segmentationPrete = () => Boolean(sessionPromise);

// Nom du cache tenu par le service worker (public/sw.js), où runtime et modèle
// survivent aux mises à jour de l'application.
const CACHE_LOURD = 'chez-moi-lourd-v1';

/** Le modèle est-il déjà sur l'appareil ? Sert à l'annoncer dans les réglages. */
export async function modeleEnCache() {
  if (!self.caches) return false;
  const cache = await caches.open(CACHE_LOURD);
  return Boolean(await cache.match(MODELE));
}

/** Rend les 19 Mo à l'appareil. Le prochain détourage les retéléchargera. */
export async function oublierModele() {
  sessionPromise = null;
  if (!self.caches) return false;
  return caches.delete(CACHE_LOURD);
}

function versTenseur(bitmap, ort) {
  const petite = new OffscreenCanvas(COTE, COTE);
  const ctx = petite.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, COTE, COTE);
  const { data } = ctx.getImageData(0, 0, COTE, COTE);

  const pixels = COTE * COTE;
  const donnees = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    donnees[i] = (data[i * 4] / 255 - MOYENNE[0]) / ECART[0];
    donnees[pixels + i] = (data[i * 4 + 1] / 255 - MOYENNE[1]) / ECART[1];
    donnees[pixels * 2 + i] = (data[i * 4 + 2] / 255 - MOYENNE[2]) / ECART[2];
  }
  return new ort.Tensor('float32', donnees, [1, 3, COTE, COTE]);
}

/** Le masque sort en valeurs quelconques : on l'étale entre 0 et 1. */
function masqueNormalise(sortie) {
  let min = Infinity;
  let max = -Infinity;
  for (const valeur of sortie) {
    if (valeur < min) min = valeur;
    if (valeur > max) max = valeur;
  }
  const amplitude = max - min || 1;
  const masque = new Uint8ClampedArray(sortie.length);
  for (let i = 0; i < sortie.length; i += 1) masque[i] = ((sortie[i] - min) / amplitude) * 255;
  return masque;
}

/**
 * Détoure une image par le modèle.
 * @returns {Promise<{toile: OffscreenCanvas, couverture: number}>}
 */
export async function detourerParModele(bitmap, surAvancement) {
  const { ort, session } = await preparerSegmentation(surAvancement);
  surAvancement?.('calcul');

  const sortie = await session.run({ [session.inputNames[0]]: versTenseur(bitmap, ort) });
  const masque = masqueNormalise(sortie[session.outputNames[0]].data);

  // Le masque est en 320x320 : on le laisse le navigateur l'agrandir, son
  // interpolation vaut mieux qu'une remise à l'échelle maison.
  const petitMasque = new OffscreenCanvas(COTE, COTE);
  const ctxMasque = petitMasque.getContext('2d');
  const imageMasque = ctxMasque.createImageData(COTE, COTE);
  for (let i = 0; i < masque.length; i += 1) {
    imageMasque.data[i * 4] = masque[i];
    imageMasque.data[i * 4 + 1] = masque[i];
    imageMasque.data[i * 4 + 2] = masque[i];
    imageMasque.data[i * 4 + 3] = 255;
  }
  ctxMasque.putImageData(imageMasque, 0, 0);

  const grandMasque = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctxGrand = grandMasque.getContext('2d', { willReadFrequently: true });
  ctxGrand.drawImage(petitMasque, 0, 0, bitmap.width, bitmap.height);
  const alpha = ctxGrand.getImageData(0, 0, bitmap.width, bitmap.height).data;

  const toile = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

  let visibles = 0;
  for (let i = 0; i < alpha.length; i += 4) {
    const valeur = alpha[i];
    image.data[i + 3] = valeur;
    if (valeur > 127) visibles += 1;
  }
  ctx.putImageData(image, 0, 0);

  return { toile, couverture: visibles / (bitmap.width * bitmap.height) };
}
