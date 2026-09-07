/**
 * La géométrie du moteur : où se trouvent les meubles dans la pièce, et où
 * tombent leur silhouette et leur ombre dans la photo.
 *
 * Un meuble est décrit par ce qu'on sait vraiment de lui — une position au sol
 * en centimètres, une orientation, un encombrement — et non par un rectangle de
 * pixels. Sa photo détourée est plaquée sur un panneau vertical dressé à cet
 * endroit : c'est une approximation, un meuble n'est pas plat, mais elle est
 * juste là où l'œil regarde, la ligne de contact avec le sol et la hauteur
 * apparente. L'ombre, elle, n'est plus une ellipse décorative : c'est cette
 * même silhouette aplatie sur le sol depuis la direction de la lumière.
 */

const RAD = Math.PI / 180;

/** Lumière de jour venant de la gauche, assez haute pour ne pas allonger les ombres. */
export const LUMIERE_PAR_DEFAUT = { azimutDeg: -38, elevationDeg: 54 };

/** Direction *vers* la lumière, dans le monde. */
export function directionLumiere({ azimutDeg, elevationDeg }) {
  const a = azimutDeg * RAD;
  const e = Math.max(8, elevationDeg) * RAD; // rasante, l'ombre partirait à l'infini
  return [Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)];
}

/**
 * Les quatre coins du panneau vertical portant la photo du meuble.
 * Ordre : haut-gauche, haut-droit, bas-droit, bas-gauche.
 */
export function sommetsPanneau({ x, y, orientation = 0, largeurCm, hauteurCm }) {
  const dx = Math.cos(orientation);
  const dy = Math.sin(orientation);
  const demi = largeurCm / 2;
  const gauche = [x - demi * dx, y - demi * dy];
  const droite = [x + demi * dx, y + demi * dy];
  return [
    [gauche[0], gauche[1], hauteurCm],
    [droite[0], droite[1], hauteurCm],
    [droite[0], droite[1], 0],
    [gauche[0], gauche[1], 0],
  ];
}

/** Le rectangle que le meuble occupe réellement au sol. */
export function empriseAuSol({ x, y, orientation = 0, largeurCm, profondeurCm }) {
  const dx = Math.cos(orientation);
  const dy = Math.sin(orientation);
  const px = -dy;
  const py = dx;
  const l = largeurCm / 2;
  const p = (profondeurCm > 0 ? profondeurCm : largeurCm * 0.6) / 2;
  return [
    [x - l * dx - p * px, y - l * dy - p * py],
    [x + l * dx - p * px, y + l * dy - p * py],
    [x + l * dx + p * px, y + l * dy + p * py],
    [x - l * dx + p * px, y - l * dy + p * py],
  ];
}

/** Aplatit des points du monde sur le sol, depuis la direction de la lumière. */
export function aplatirAuSol(sommets, direction) {
  const [lx, ly, lz] = direction;
  if (lz <= 0.05) return null;
  return sommets.map(([x, y, z]) => [x - (lx * z) / lz, y - (ly * z) / lz, 0]);
}

/** Projette des points du monde dans l'image. Retourne null si l'un passe derrière l'objectif. */
export function projeter(camera, sommets) {
  const projetes = [];
  for (const [x, y, z] of sommets) {
    const p = camera.projeter(x, y, z);
    if (!p) return null;
    projetes.push({ x: p.x, y: p.y, w: p.profondeur });
  }
  return projetes;
}

/** Les huit coins de la boîte d'encombrement, pour la dessiner en fil de fer. */
export function boiteEncombrement({ x, y, orientation = 0, largeurCm, profondeurCm, hauteurCm }) {
  const sol = empriseAuSol({ x, y, orientation, largeurCm, profondeurCm });
  return {
    bas: sol.map(([px, py]) => [px, py, 0]),
    haut: sol.map(([px, py]) => [px, py, hauteurCm]),
  };
}

/**
 * Deux emprises au sol se chevauchent-elles ? Théorème de l'axe séparateur,
 * suffisant pour deux rectangles orientés.
 */
export function seChevauchent(a, b) {
  for (const polygone of [a, b]) {
    for (let i = 0; i < polygone.length; i += 1) {
      const j = (i + 1) % polygone.length;
      const axe = [-(polygone[j][1] - polygone[i][1]), polygone[j][0] - polygone[i][0]];
      const etendue = (p) => {
        let min = Infinity;
        let max = -Infinity;
        for (const [x, y] of p) {
          const v = x * axe[0] + y * axe[1];
          if (v < min) min = v;
          if (v > max) max = v;
        }
        return [min, max];
      };
      const [minA, maxA] = etendue(a);
      const [minB, maxB] = etendue(b);
      if (maxA <= minB + 1e-6 || maxB <= minA + 1e-6) return false;
    }
  }
  return true;
}

/** Un point est-il dans un polygone convexe donné dans l'ordre ? */
export function dansPolygone(point, polygone) {
  let signe = 0;
  for (let i = 0; i < polygone.length; i += 1) {
    const a = polygone[i];
    const b = polygone[(i + 1) % polygone.length];
    const croix = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (Math.abs(croix) < 1e-9) continue;
    const courant = croix > 0 ? 1 : -1;
    if (!signe) signe = courant;
    else if (courant !== signe) return false;
  }
  return true;
}
