/**
 * L'éditeur de montage : une photo de pièce, des meubles détourés posés dessus,
 * déplaçables au doigt.
 *
 * Deux régimes cohabitent.
 *
 * Sans calage, un meuble garde une taille constante où qu'on le pose : c'est un
 * collage, honnête mais plat. Les proportions entre meubles restent exactes,
 * puisque chacun est dessiné à sa largeur réelle.
 *
 * Après calage du sol, une homographie relie le plan du sol à l'image. Un
 * meuble est alors posé à des coordonnées en centimètres dans la pièce, et non
 * plus en pixels : il rétrécit en s'éloignant, grandit en s'approchant, et
 * s'ordonne en profondeur tout seul. C'est ce qui sépare un collage d'une
 * incrustation.
 */

import { cadreVisible } from './montage.js';
import { homographie, inverser, projeter, pixelsParCm } from './homographie.js';
import { cameraDepuisSol } from './camera-photo.js';
import { RenduVolume } from './rendu-volume.js';
import {
  LUMIERE_PAR_DEFAUT,
  directionLumiere,
  sommetsPanneau,
  empriseAuSol,
  aplatirAuSol,
  projeter as projeterMonde,
  seChevauchent,
  dansPolygone,
} from './volume.js';

const LARGEUR_PAR_DEFAUT_CM = 100;

/** Trois passes légèrement décalées valent une pénombre, sans passe de flou. */
const PASSES_OMBRE = [
  { ecart: 0, opacite: 0.2 },
  { ecart: 7, opacite: 0.11 },
  { ecart: -7, opacite: 0.11 },
];

export class EditeurMontage {
  constructor(toileAffichage, fond) {
    this.canvas = toileAffichage;
    this.fond = fond;
    this.canvas.width = fond.width;
    this.canvas.height = fond.height;
    this.ctx = this.canvas.getContext('2d');
    this.couches = [];
    this.selection = null;
    this.calage = null;
    this.camera = null;
    this.pxParCm = fond.width / 400; // une pièce de 4 m de large, à ajuster
    this.surChangement = () => {};

    // Le moteur dessine hors écran puis vient se poser sur la toile visible :
    // les gestes, la sélection et l'export continuent de passer par le 2D.
    this.volume = false;
    this.lumiere = { ...LUMIERE_PAR_DEFAUT };
    this.toileVolume = document.createElement('canvas');
    try {
      this.moteur = RenduVolume.creer(this.toileVolume);
    } catch {
      this.moteur = null; // pilote graphique récalcitrant : on reste en 2D
    }

    // Repère de calage : un quadrilatère posé sur le sol présumé.
    this.reperage = false;
    this.repere = [
      { x: fond.width * 0.18, y: fond.height * 0.94 },
      { x: fond.width * 0.82, y: fond.height * 0.94 },
      { x: fond.width * 0.68, y: fond.height * 0.66 },
      { x: fond.width * 0.32, y: fond.height * 0.66 },
    ];

    this.#brancherGestes();
    this.dessiner();
  }

  /* ---------- calage du sol ---------- */

  entrerReperage(actif) {
    this.reperage = actif;
    this.selection = null;
    this.dessiner();
    this.surChangement();
  }

  /**
   * @param {number} largeurCm largeur réelle du rectangle marqué au sol
   * @param {number} profondeurCm sa profondeur réelle
   */
  calerSol(largeurCm, profondeurCm) {
    const monde = [
      { x: 0, y: 0 },
      { x: largeurCm, y: 0 },
      { x: largeurCm, y: profondeurCm },
      { x: 0, y: profondeurCm },
    ];
    const h = homographie(monde, this.repere);
    const hInv = h && inverser(h);
    if (!h || !hInv) return false;

    this.calage = { h, hInv, largeurCm, profondeurCm };
    this.camera = cameraDepuisSol(h, this.fond.width, this.fond.height);
    if (!this.camera) this.volume = false;

    // Les meubles déjà posés reprennent pied : leur position en pixels devient
    // une position au sol.
    for (const couche of this.couches) {
      if (couche.monde) continue;
      const sol = projeter(hInv, couche.x, couche.y);
      couche.monde = sol ? { x: sol.x, y: sol.y } : { x: largeurCm / 2, y: profondeurCm / 2 };
    }
    this.reperage = false;
    this.dessiner();
    this.surChangement();
    return true;
  }

  annulerCalage() {
    this.calage = null;
    this.camera = null;
    this.volume = false;
    for (const couche of this.couches) delete couche.monde;
    this.dessiner();
    this.surChangement();
  }

  /** Le moteur ne peut travailler qu'avec un sol calé et une carte graphique. */
  volumeDisponible() {
    return Boolean(this.calage && this.camera && this.moteur);
  }

  passerEnVolume(actif) {
    this.volume = Boolean(actif) && this.volumeDisponible();
    this.dessiner();
    this.surChangement();
    return this.volume;
  }

  reglerLumiere({ azimutDeg, elevationDeg }) {
    if (Number.isFinite(azimutDeg)) this.lumiere.azimutDeg = azimutDeg;
    if (Number.isFinite(elevationDeg)) this.lumiere.elevationDeg = elevationDeg;
    this.dessiner();
  }

  reglerOrientationSelection(radians) {
    if (!this.selection) return;
    this.selection.orientation = radians;
    this.dessiner();
    this.surChangement();
  }

  /* ---------- couches ---------- */

  ajouter({ nom, toile, largeurCm, profondeurCm, hauteurCm }) {
    const cadre = cadreVisible(toile);
    const annoncee = largeurCm > 20 ? largeurCm : LARGEUR_PAR_DEFAUT_CM;
    const rapport = cadre.hauteur / cadre.largeur;

    // Les cotes du fabricant et le cadrage de la photo se contredisent souvent :
    // une fiche montre le meuble de trois quarts, avec de la marge autour. Plutôt
    // que d'écraser l'image pour la faire entrer dans les cotes, on garde ses
    // proportions et on répartit l'écart sur l'échelle — moyenne géométrique des
    // deux largeurs possibles, celle de la cote et celle qu'impose la hauteur.
    // Quand les deux s'accordent, elle redonne exactement la cote annoncée.
    const largeurEffective = hauteurCm > 10 ? Math.sqrt(annoncee * (hauteurCm / rapport)) : annoncee;
    const facteur = largeurEffective / annoncee;

    const couche = {
      nom,
      toile,
      cadre,
      cotesAnnoncees: { largeurCm: annoncee, profondeurCm: profondeurCm || 0, hauteurCm: hauteurCm || 0 },
      largeurCm: largeurEffective,
      hauteurCm: largeurEffective * rapport,
      profondeurCm: (profondeurCm > 10 ? profondeurCm : annoncee * 0.6) * facteur,
      orientation: 0,
      ajustement: 1,
      x: this.fond.width / 2,
      y: this.fond.height * 0.78,
    };
    if (this.calage) {
      couche.monde = { x: this.calage.largeurCm / 2, y: this.calage.profondeurCm * 0.5 };
    }
    this.couches.push(couche);

    // Un meuble qui déborde de la photo dès sa pose n'aide personne à juger.
    const { largeur, hauteur } = this.#geometrie(couche);
    const debordement = Math.max(largeur / (this.fond.width * 0.85), hauteur / (this.fond.height * 0.75));
    if (debordement > 1) couche.ajustement = 1 / debordement;

    this.selection = couche;
    this.dessiner();
    this.surChangement();
    return couche;
  }

  retirerSelection() {
    if (!this.selection) return;
    this.couches = this.couches.filter((couche) => couche !== this.selection);
    this.selection = null;
    this.dessiner();
    this.surChangement();
  }

  reglerEchelle(pxParCm) {
    this.pxParCm = pxParCm;
    this.dessiner();
  }

  reglerTailleSelection(ajustement) {
    if (!this.selection) return;
    this.selection.ajustement = ajustement;
    this.dessiner();
  }

  /** Géométrie d'une couche : largeur réelle × échelle locale, ancrée au sol. */
  #geometrie(couche) {
    let echelle = this.pxParCm;
    let ancre = { x: couche.x, y: couche.y };

    if (this.calage && couche.monde) {
      const surImage = projeter(this.calage.h, couche.monde.x, couche.monde.y);
      const locale = pixelsParCm(this.calage.h, couche.monde.x, couche.monde.y);
      if (surImage && locale) {
        ancre = surImage;
        echelle = locale;
      }
    }

    const largeur = couche.largeurCm * echelle * couche.ajustement;
    const ratio = couche.cadre.hauteur / couche.cadre.largeur;
    const hauteur = largeur * ratio;
    return { largeur, hauteur, x: ancre.x - largeur / 2, y: ancre.y - hauteur, ancre };
  }

  /**
   * Géométrie d'une couche vue par le moteur : le panneau vertical dressé à sa
   * place, son emprise au sol, et sa distance à l'objectif pour le tri.
   */
  #geometrieVolume(couche) {
    if (!this.camera || !couche.monde) return null;
    const assise = {
      x: couche.monde.x,
      y: couche.monde.y,
      orientation: couche.orientation || 0,
      largeurCm: couche.largeurCm * couche.ajustement,
      hauteurCm: couche.hauteurCm * couche.ajustement,
      profondeurCm: couche.profondeurCm * couche.ajustement,
    };
    const panneauMonde = sommetsPanneau(assise);
    const panneau = projeterMonde(this.camera, panneauMonde);
    if (!panneau) return null;
    const centre = this.camera.projeter(assise.x, assise.y, 0);
    return {
      couche,
      assise,
      panneauMonde,
      panneau,
      emprise: empriseAuSol(assise),
      profondeur: centre ? centre.profondeur : Infinity,
    };
  }

  /** Les couches prêtes à dessiner, la plus lointaine d'abord. */
  #rendus() {
    return this.couches
      .map((couche) => this.#geometrieVolume(couche))
      .filter(Boolean)
      .sort((a, b) => b.profondeur - a.profondeur);
  }

  /** Taille à laquelle une couche est rendue, en pixels et en px/cm. */
  mesures(couche) {
    if (this.volume) {
      const rendu = this.#geometrieVolume(couche);
      if (rendu) {
        const [hg, hd, bd, bg] = rendu.panneau;
        const largeurPx = Math.hypot(bd.x - bg.x, bd.y - bg.y);
        const hauteurPx = (Math.hypot(bg.x - hg.x, bg.y - hg.y) + Math.hypot(bd.x - hd.x, bd.y - hd.y)) / 2;
        return {
          largeurPx,
          hauteurPx,
          echelle: largeurPx / rendu.assise.largeurCm,
          ancre: { x: (bg.x + bd.x) / 2, y: (bg.y + bd.y) / 2 },
        };
      }
    }
    const { largeur, hauteur, ancre } = this.#geometrie(couche);
    return { largeurPx: largeur, hauteurPx: hauteur, echelle: largeur / couche.largeurCm / couche.ajustement, ancre };
  }

  /** Les meubles dont les emprises au sol se marchent dessus. */
  chevauchements() {
    const rendus = this.#rendus();
    const fautifs = new Set();
    for (let i = 0; i < rendus.length; i += 1) {
      for (let j = i + 1; j < rendus.length; j += 1) {
        if (seChevauchent(rendus[i].emprise, rendus[j].emprise)) {
          fautifs.add(rendus[i].couche);
          fautifs.add(rendus[j].couche);
        }
      }
    }
    return fautifs;
  }

  /** Pose une couche à un point du sol, en centimètres. */
  poserAu(couche, x, y) {
    if (!this.calage) return false;
    couche.monde = { x, y };
    this.dessiner();
    return true;
  }

  /** Le plus lointain d'abord : c'est ce qui donne l'ordre d'occultation. */
  #ordreProfondeur() {
    return [...this.couches].sort((a, b) => {
      if (this.calage && a.monde && b.monde) return b.monde.y - a.monde.y;
      return a.y - b.y;
    });
  }

  dessiner() {
    if (this.volume && this.volumeDisponible()) {
      this.#dessinerVolume();
      return;
    }
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.fond, 0, 0);

    for (const couche of this.#ordreProfondeur()) {
      const { largeur, hauteur, x, y, ancre } = this.#geometrie(couche);

      // Une ombre au sol, discrète, suffit à décoller le meuble du fond.
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.filter = 'blur(6px)';
      ctx.beginPath();
      ctx.ellipse(ancre.x, ancre.y, largeur * 0.42, Math.max(3, hauteur * 0.06), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.drawImage(
        couche.toile,
        couche.cadre.x, couche.cadre.y, couche.cadre.largeur, couche.cadre.hauteur,
        x, y, largeur, hauteur
      );

      if (couche === this.selection && !this.reperage) {
        ctx.save();
        ctx.strokeStyle = '#b5613f';
        ctx.lineWidth = Math.max(2, this.canvas.width / 320);
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(x, y, largeur, hauteur);
        ctx.restore();
      }
    }

    if (this.reperage) this.#dessinerRepere();
  }

  /**
   * Le rendu du moteur : la photo, puis toutes les ombres, puis les meubles du
   * plus lointain au plus proche. Les ombres passent avant tous les meubles,
   * sans quoi celle d'un meuble du fond viendrait se poser sur un meuble proche.
   */
  #dessinerVolume() {
    const { ctx, moteur } = this;
    moteur.dimensionner(this.canvas.width, this.canvas.height);
    moteur.effacer();
    moteur.fond(this.fond);

    const rendus = this.#rendus();

    for (const rendu of rendus) {
      for (const passe of PASSES_OMBRE) {
        const direction = directionLumiere({
          azimutDeg: this.lumiere.azimutDeg + passe.ecart,
          elevationDeg: this.lumiere.elevationDeg,
        });
        const aplati = aplatirAuSol(rendu.panneauMonde, direction);
        const projete = aplati && projeterMonde(this.camera, aplati);
        if (projete) moteur.quad(rendu.couche.toile, rendu.couche.cadre, projete, [0.05, 0.04, 0.04, passe.opacite]);
      }
    }

    for (const rendu of rendus) moteur.quad(rendu.couche.toile, rendu.couche.cadre, rendu.panneau);

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.toileVolume, 0, 0);

    if (this.reperage) {
      this.#dessinerRepere();
      return;
    }

    const fautifs = this.chevauchements();
    for (const rendu of rendus) {
      const selectionne = rendu.couche === this.selection;
      if (!selectionne && !fautifs.has(rendu.couche)) continue;
      this.#dessinerEncombrement(rendu, fautifs.has(rendu.couche) ? '#c0392b' : '#b5613f', selectionne);
    }
  }

  /** L'emprise au sol et le volume du meuble, en fil de fer. */
  #dessinerEncombrement(rendu, couleur, complet) {
    const { ctx } = this;
    const sol = projeterMonde(this.camera, rendu.emprise.map(([x, y]) => [x, y, 0]));
    if (!sol) return;
    const trait = Math.max(1.5, this.canvas.width / 500);

    ctx.save();
    ctx.strokeStyle = couleur;
    ctx.lineWidth = trait;
    ctx.setLineDash([9, 7]);
    ctx.beginPath();
    sol.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.stroke();

    if (complet) {
      const haut = projeterMonde(this.camera, rendu.emprise.map(([x, y]) => [x, y, rendu.assise.hauteurCm]));
      if (haut) {
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        haut.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        sol.forEach((p, i) => { ctx.moveTo(p.x, p.y); ctx.lineTo(haut[i].x, haut[i].y); });
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  #dessinerRepere() {
    const { ctx } = this;
    const rayon = Math.max(10, this.canvas.width / 45);

    ctx.save();
    ctx.fillStyle = 'rgba(181, 97, 63, 0.16)';
    ctx.strokeStyle = '#b5613f';
    ctx.lineWidth = Math.max(2, this.canvas.width / 300);
    ctx.beginPath();
    this.repere.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    for (const point of this.repere) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, rayon, 0, Math.PI * 2);
      ctx.fillStyle = '#b5613f';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(2, rayon / 4);
      ctx.stroke();
    }
    ctx.restore();
  }

  #pointVers(evenement) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((evenement.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((evenement.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  #coucheSous(point) {
    if (this.volume && this.volumeDisponible()) {
      const rendus = this.#rendus().reverse(); // le plus proche décide
      return rendus.find((rendu) => dansPolygone(point, rendu.panneau))?.couche || null;
    }
    const proches = [...this.#ordreProfondeur()].reverse();
    return (
      proches.find((couche) => {
        const { largeur, hauteur, x, y } = this.#geometrie(couche);
        return point.x >= x && point.x <= x + largeur && point.y >= y && point.y <= y + hauteur;
      }) || null
    );
  }

  #brancherGestes() {
    let deplacement = null;

    this.canvas.addEventListener('pointerdown', (evenement) => {
      const point = this.#pointVers(evenement);

      if (this.reperage) {
        const rayon = Math.max(18, this.canvas.width / 30);
        const sommet = this.repere.find((coin) => Math.hypot(coin.x - point.x, coin.y - point.y) < rayon);
        if (sommet) {
          deplacement = { sommet };
          this.canvas.setPointerCapture(evenement.pointerId);
        }
        return;
      }

      const couche = this.#coucheSous(point);
      this.selection = couche;
      this.surChangement();
      if (!couche) {
        this.dessiner();
        return;
      }
      // L'ancre est le milieu du contact avec le sol, en 2D comme en volume :
      // c'est ce point-là qu'on fait glisser sur le plancher.
      const { ancre } = this.mesures(couche);
      deplacement = { couche, dx: ancre.x - point.x, dy: ancre.y - point.y };
      this.canvas.setPointerCapture(evenement.pointerId);
      this.dessiner();
    });

    this.canvas.addEventListener('pointermove', (evenement) => {
      if (!deplacement) return;
      evenement.preventDefault();
      const point = this.#pointVers(evenement);

      if (deplacement.sommet) {
        deplacement.sommet.x = point.x;
        deplacement.sommet.y = point.y;
        this.dessiner();
        return;
      }

      const cible = { x: point.x + deplacement.dx, y: point.y + deplacement.dy };
      const couche = deplacement.couche;
      if (this.calage && couche.monde) {
        // On déplace le meuble sur le sol, pas sur l'image : c'est de là que
        // vient le changement de taille avec la profondeur.
        const sol = projeter(this.calage.hInv, cible.x, cible.y);
        if (sol) couche.monde = { x: sol.x, y: sol.y };
      } else {
        couche.x = cible.x;
        couche.y = cible.y;
      }
      this.dessiner();
    });

    const relacher = () => { deplacement = null; };
    this.canvas.addEventListener('pointerup', relacher);
    this.canvas.addEventListener('pointercancel', relacher);
  }

  /** Export sans le cadre de sélection ni le repère de calage. */
  async exporter() {
    const selection = this.selection;
    const reperage = this.reperage;
    this.selection = null;
    this.reperage = false;
    this.dessiner();
    const blob = await new Promise((resoudre) => this.canvas.toBlob(resoudre, 'image/jpeg', 0.9));
    this.selection = selection;
    this.reperage = reperage;
    this.dessiner();
    return blob;
  }
}
