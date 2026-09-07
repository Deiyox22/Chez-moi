/**
 * Homographie du plan du sol.
 *
 * Une photo perd la profondeur, mais pas complètement : un plan de la scène —
 * ici le sol — reste lié à l'image par une transformation projective à huit
 * paramètres. Il suffit de quatre correspondances pour la retrouver. Une fois
 * connue, on sait où tombe dans l'image n'importe quel point du sol, et
 * combien de pixels y vaut un centimètre : un meuble posé au fond rétrécit
 * alors tout seul, ce qu'un simple collage ne saura jamais faire.
 */

/** Résout un système linéaire par élimination de Gauss avec pivot partiel. */
function resoudre(matrice, second) {
  const n = second.length;
  const a = matrice.map((ligne, i) => [...ligne, second[i]]);

  for (let colonne = 0; colonne < n; colonne += 1) {
    let pivot = colonne;
    for (let ligne = colonne + 1; ligne < n; ligne += 1) {
      if (Math.abs(a[ligne][colonne]) > Math.abs(a[pivot][colonne])) pivot = ligne;
    }
    if (Math.abs(a[pivot][colonne]) < 1e-12) return null; // points alignés ou confondus
    [a[colonne], a[pivot]] = [a[pivot], a[colonne]];

    for (let ligne = 0; ligne < n; ligne += 1) {
      if (ligne === colonne) continue;
      const facteur = a[ligne][colonne] / a[colonne][colonne];
      if (!facteur) continue;
      for (let k = colonne; k <= n; k += 1) a[ligne][k] -= facteur * a[colonne][k];
    }
  }
  return a.map((ligne, i) => ligne[n] / ligne[i]);
}

/**
 * Homographie envoyant quatre points source sur quatre points destination.
 * @param {Array<{x:number,y:number}>} source
 * @param {Array<{x:number,y:number}>} destination
 * @returns {number[]|null} matrice 3x3 aplatie, h33 valant 1
 */
export function homographie(source, destination) {
  if (source.length !== 4 || destination.length !== 4) return null;
  const matrice = [];
  const second = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = source[i];
    const { x: u, y: v } = destination[i];
    matrice.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    second.push(u);
    matrice.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    second.push(v);
  }
  const solution = resoudre(matrice, second);
  return solution ? [...solution, 1] : null;
}

/** Applique une homographie à un point. */
export function projeter(h, x, y) {
  const denominateur = h[6] * x + h[7] * y + h[8];
  if (Math.abs(denominateur) < 1e-12) return null;
  return {
    x: (h[0] * x + h[1] * y + h[2]) / denominateur,
    y: (h[3] * x + h[4] * y + h[5]) / denominateur,
  };
}

/** Inverse une homographie 3x3. */
export function inverser(h) {
  const [a, b, c, d, e, f, g, i, j] = h;
  const A = e * j - f * i;
  const B = f * g - d * j;
  const C = d * i - e * g;
  const determinant = a * A + b * B + c * C;
  if (Math.abs(determinant) < 1e-12) return null;
  return [
    A / determinant,
    (c * i - b * j) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * j - c * g) / determinant,
    (c * d - a * f) / determinant,
    C / determinant,
    (b * g - a * i) / determinant,
    (a * e - b * d) / determinant,
  ];
}

/**
 * Combien de pixels vaut un centimètre au point (x, y) du sol.
 * Mesuré sur place : la valeur diminue à mesure qu'on s'éloigne.
 */
export function pixelsParCm(h, x, y) {
  const ici = projeter(h, x, y);
  const unPeuPlusLoin = projeter(h, x + 10, y);
  if (!ici || !unPeuPlusLoin) return null;
  return Math.hypot(unPeuPlusLoin.x - ici.x, unPeuPlusLoin.y - ici.y) / 10;
}
