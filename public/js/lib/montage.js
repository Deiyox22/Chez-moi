/**
 * Montage : la photo de la pièce en fond, les meubles détourés par-dessus.
 *
 * Aucun appel réseau facturé — tout se passe dans le navigateur. Le montage ne
 * cherche pas le photoréalisme : il répond à « est-ce que ce meuble tient là,
 * à cette taille, avec ces couleurs ». Les proportions entre meubles sont
 * exactes, calculées depuis leurs dimensions réelles en centimètres ; l'échelle
 * d'ensemble, elle, se règle à la main puisque rien dans une photo ne dit
 * combien de pixels fait un mètre.
 */

const TOLERANCE = 42; // distance couleur admise autour du fond
const MARGE_ALPHA = 0.55;

/** Charge une image en contournant CORS via le relais du serveur si besoin. */
export async function chargerImage(url) {
  const sources = url.startsWith('/') ? [url] : [`/api/catalog/image?url=${encodeURIComponent(url)}`, url];
  for (const source of sources) {
    try {
      const reponse = await fetch(source);
      if (!reponse.ok) continue;
      return await createImageBitmap(await reponse.blob());
    } catch {
      /* on tente la source suivante */
    }
  }
  return null;
}

const distance = (donnees, index, r, v, b) =>
  Math.abs(donnees[index] - r) + Math.abs(donnees[index + 1] - v) + Math.abs(donnees[index + 2] - b);

/**
 * Détoure une photo produit en propageant depuis les bords tant que la couleur
 * reste celle du fond. Les fiches boutique sont sur fond uni : c'est ce qui
 * rend l'opération fiable sans modèle de segmentation.
 */
export function detourer(bitmap) {
  const largeur = bitmap.width;
  const hauteur = bitmap.height;
  const toile = new OffscreenCanvas(largeur, hauteur);
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);

  const image = ctx.getImageData(0, 0, largeur, hauteur);
  const donnees = image.data;

  // Couleur du fond : moyenne des quatre coins.
  const coins = [0, (largeur - 1) * 4, (hauteur - 1) * largeur * 4, (hauteur * largeur - 1) * 4];
  let r = 0;
  let v = 0;
  let b = 0;
  for (const coin of coins) {
    r += donnees[coin];
    v += donnees[coin + 1];
    b += donnees[coin + 2];
  }
  r /= 4;
  v /= 4;
  b /= 4;

  // Un fond sombre ou bariolé n'est pas un fond de fiche produit : on renonce
  // plutôt que de trouer le meuble.
  const coinsProches = coins.every((coin) => distance(donnees, coin, r, v, b) < TOLERANCE);
  if (!coinsProches) return { toile, detoure: false };

  const vus = new Uint8Array(largeur * hauteur);
  const file = [];
  for (let x = 0; x < largeur; x += 1) {
    file.push(x, x + (hauteur - 1) * largeur);
  }
  for (let y = 0; y < hauteur; y += 1) {
    file.push(y * largeur, largeur - 1 + y * largeur);
  }

  let efface = 0;
  while (file.length) {
    const pixel = file.pop();
    if (vus[pixel]) continue;
    vus[pixel] = 1;
    const index = pixel * 4;
    if (distance(donnees, index, r, v, b) > TOLERANCE) continue;
    donnees[index + 3] = 0;
    efface += 1;

    const x = pixel % largeur;
    const y = (pixel - x) / largeur;
    if (x > 0) file.push(pixel - 1);
    if (x < largeur - 1) file.push(pixel + 1);
    if (y > 0) file.push(pixel - largeur);
    if (y < hauteur - 1) file.push(pixel + largeur);
  }

  // Un fond qui couvre presque tout signifie qu'on a mangé le sujet.
  if (efface > largeur * hauteur * 0.94) return { toile, detoure: false };

  // Adoucir la découpe : un pixel opaque voisin du vide perd un peu d'alpha.
  for (let y = 1; y < hauteur - 1; y += 1) {
    for (let x = 1; x < largeur - 1; x += 1) {
      const index = (y * largeur + x) * 4;
      if (donnees[index + 3] === 0) continue;
      const voisins = [index - 4, index + 4, index - largeur * 4, index + largeur * 4];
      if (voisins.some((voisin) => donnees[voisin + 3] === 0)) donnees[index + 3] = 255 * MARGE_ALPHA;
    }
  }

  ctx.putImageData(image, 0, 0);
  return { toile, detoure: true, remplissage: 1 - efface / (largeur * hauteur) };
}

/** Cadre englobant les pixels visibles, pour poser le meuble sur son sol. */
export function cadreVisible(toile) {
  const ctx = toile.getContext('2d', { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, toile.width, toile.height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX > maxX || minY > maxY) return { x: 0, y: 0, largeur: width, hauteur: height };
  return { x: minX, y: minY, largeur: maxX - minX + 1, hauteur: maxY - minY + 1 };
}
