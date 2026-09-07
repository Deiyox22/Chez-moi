/**
 * Catalogue titles carry their measurements in plain sight — "Tapis 160x230",
 * "Étagère 120 cm", "L.180 x P.90 x H.75". Reading them turns a bought product
 * into something the floor plan can actually place.
 */

const NOMBRE = '(\\d{2,3}(?:[.,]\\d)?)';

const MOTIFS = [
  // L x P x H, avec ou sans lettres
  new RegExp(`(?:l\\.?\\s*)?${NOMBRE}\\s*[x×]\\s*(?:p\\.?\\s*)?${NOMBRE}\\s*[x×]\\s*(?:h\\.?\\s*)?${NOMBRE}`, 'i'),
  // deux dimensions seulement : largeur x profondeur
  new RegExp(`${NOMBRE}\\s*[x×]\\s*${NOMBRE}`, 'i'),
];

const nombre = (valeur) => Number(String(valeur).replace(',', '.'));

/**
 * @param {...string} sources titre, description, dimensions annoncees
 * @returns {{largeurCm: number, profondeurCm: number, hauteurCm: number}}
 */
export function lireDimensions(...sources) {
  const texte = sources.filter(Boolean).join(' ');
  for (const motif of MOTIFS) {
    const trouve = motif.exec(texte);
    if (!trouve) continue;
    const [, a, b, c] = trouve;
    return {
      largeurCm: nombre(a),
      profondeurCm: nombre(b),
      hauteurCm: c ? nombre(c) : 0,
    };
  }

  // Une seule cote annoncee : mieux que rien pour l'encombrement.
  const seule = new RegExp(`${NOMBRE}\\s*cm`, 'i').exec(texte);
  if (seule) return { largeurCm: nombre(seule[1]), profondeurCm: 0, hauteurCm: 0 };

  return { largeurCm: 0, profondeurCm: 0, hauteurCm: 0 };
}
