/**
 * La caméra qui a pris votre photo.
 *
 * L'homographie du sol suffit à faire rétrécir un meuble quand on l'éloigne,
 * mais elle ne parle que du sol : elle ignore la hauteur. Un meuble reste donc
 * une vignette mise à l'échelle, dont les arêtes verticales sont parallèles
 * alors que la photo, elle, les fait converger. C'est ce qui trahit le collage.
 *
 * Or une homographie de plan en dit bien plus qu'elle n'en a l'air. Elle vaut
 * K·[r1 r2 t] à un facteur près : les deux premières colonnes d'une rotation et
 * une translation, vues à travers la matrice interne de l'appareil. Comme r1 et
 * r2 sont unitaires et orthogonaux, deux équations tombent, et il ne reste
 * qu'une inconnue — la focale. On la résout, on complète la rotation par
 * r3 = r1 × r2, et la caméra est reconstituée : position, orientation, champ.
 *
 * À partir de là on ne projette plus le sol, on projette la pièce. Un point à
 * un mètre du sol tombe où il doit tomber, les verticales convergent vers leur
 * point de fuite, et une ombre peut être calculée pour ce qu'elle est — la
 * silhouette du meuble aplatie sur le sol depuis la lampe.
 */

/* ---------- petite algèbre, en colonnes ---------- */

const soustraire = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const additionner = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const multiplier = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);
const normaliser = (a) => { const n = norme(a) || 1; return multiplier(a, 1 / n); };
const produitVectoriel = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Champ horizontal d'un téléphone courant, quand la focale ne se laisse pas lire. */
const CHAMP_PAR_DEFAUT = (65 * Math.PI) / 180;

/**
 * Les deux contraintes donnent chacune une estimation de la focale. On garde
 * celles qui ont un sens physique et on en fait la moyenne géométrique, plus
 * stable que l'arithmétique sur des carrés.
 */
function estimerFocale(h, cx, cy, largeur) {
  const [a1, a2, , b1, b2, , c1, c2] = h;
  const u1 = a1 - cx * c1;
  const v1 = b1 - cy * c1;
  const u2 = a2 - cx * c2;
  const v2 = b2 - cy * c2;

  const candidates = [];
  // r1 · r2 = 0
  if (Math.abs(c1 * c2) > 1e-12) {
    const carre = -(u1 * u2 + v1 * v2) / (c1 * c2);
    if (carre > 0) candidates.push(Math.sqrt(carre));
  }
  // |r1| = |r2|
  if (Math.abs(c2 * c2 - c1 * c1) > 1e-12) {
    const carre = (u1 * u1 + v1 * v1 - u2 * u2 - v2 * v2) / (c2 * c2 - c1 * c1);
    if (carre > 0) candidates.push(Math.sqrt(carre));
  }

  const parDefaut = largeur / 2 / Math.tan(CHAMP_PAR_DEFAUT / 2);
  if (!candidates.length) return { focale: parDefaut, mesuree: false };

  const focale = Math.exp(candidates.reduce((s, f) => s + Math.log(f), 0) / candidates.length);
  // Une focale aberrante vient d'un repère mal placé : mieux vaut le défaut.
  if (!Number.isFinite(focale) || focale < largeur * 0.15 || focale > largeur * 12) {
    return { focale: parDefaut, mesuree: false };
  }
  return { focale, mesuree: true };
}

/**
 * r1 et r2 sortent du calcul presque orthonormés, jamais tout à fait.
 * L'orthogonalisation symétrique les corrige sans privilégier l'un des deux.
 */
function orthonormaliser(r1, r2) {
  const somme = normaliser(additionner(r1, r2));
  const perpendiculaire = normaliser(produitVectoriel(r1, r2));
  const difference = normaliser(produitVectoriel(somme, perpendiculaire));
  const racine = Math.SQRT1_2;
  const e1 = multiplier(additionner(somme, difference), racine);
  const e2 = multiplier(soustraire(somme, difference), racine);
  return [normaliser(e1), normaliser(e2), normaliser(produitVectoriel(e1, e2))];
}

/**
 * Reconstitue la caméra à partir de l'homographie du sol.
 *
 * Le monde est en centimètres : x le long du repère, y vers le fond de la
 * pièce, z vers le haut. L'image est en pixels, y vers le bas.
 *
 * @param {number[]} h homographie sol (cm) → image (px), 9 valeurs
 * @param {number} largeur largeur de la photo en pixels
 * @param {number} hauteur hauteur de la photo en pixels
 * @returns {{projeter:Function, devant:Function, focale:number, focaleMesuree:boolean,
 *            position:number[], hauteurCameraCm:number, champVerticalDeg:number}|null}
 */
export function cameraDepuisSol(h, largeur, hauteur) {
  if (!h || h.length !== 9) return null;
  const cx = largeur / 2;
  const cy = hauteur / 2;
  const { focale, mesuree } = estimerFocale(h, cx, cy, largeur);

  // K⁻¹H, colonne par colonne.
  const colonne = (i) => [(h[i] - cx * h[6 + i]) / focale, (h[3 + i] - cy * h[6 + i]) / focale, h[6 + i]];
  const b1 = colonne(0);
  const b2 = colonne(1);
  const b3 = colonne(2);

  const echelle = 2 / (norme(b1) + norme(b2));
  if (!Number.isFinite(echelle) || echelle === 0) return null;

  // Le sol est devant l'objectif, pas derrière : c'est ce qui fixe le signe.
  const signe = b3[2] < 0 ? -1 : 1;
  const lambda = echelle * signe;

  const [r1, r2, r3] = orthonormaliser(multiplier(b1, lambda), multiplier(b2, lambda));
  const t = multiplier(b3, lambda);

  // R en lignes, pour projeter sans transposer à chaque point.
  const R = [
    [r1[0], r2[0], r3[0]],
    [r1[1], r2[1], r3[1]],
    [r1[2], r2[2], r3[2]],
  ];

  /** Un point du monde, en centimètres, vu par la caméra. */
  const versCamera = (x, y, z) => [
    R[0][0] * x + R[0][1] * y + R[0][2] * z + t[0],
    R[1][0] * x + R[1][1] * y + R[1][2] * z + t[1],
    R[2][0] * x + R[2][1] * y + R[2][2] * z + t[2],
  ];

  /** Projection dans l'image. `profondeur` sert à trier et à écarter le hors-champ. */
  const projeter = (x, y, z = 0) => {
    const [cxm, cym, czm] = versCamera(x, y, z);
    if (czm <= 1e-6) return null; // derrière l'objectif
    return { x: cx + (focale * cxm) / czm, y: cy + (focale * cym) / czm, profondeur: czm };
  };

  const devant = (x, y, z = 0) => versCamera(x, y, z)[2] > 1e-6;

  // Position de la caméra dans le monde : −Rᵀt.
  const position = [
    -(r1[0] * t[0] + r1[1] * t[1] + r1[2] * t[2]),
    -(r2[0] * t[0] + r2[1] * t[1] + r2[2] * t[2]),
    -(r3[0] * t[0] + r3[1] * t[1] + r3[2] * t[2]),
  ];

  return {
    projeter,
    devant,
    versCamera,
    focale,
    focaleMesuree: mesuree,
    position,
    hauteurCameraCm: position[2],
    champVerticalDeg: (2 * Math.atan(hauteur / 2 / focale) * 180) / Math.PI,
  };
}
