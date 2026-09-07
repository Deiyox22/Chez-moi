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

const LARGEUR_PAR_DEFAUT_CM = 100;

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
    this.pxParCm = fond.width / 400; // une pièce de 4 m de large, à ajuster
    this.surChangement = () => {};

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
    for (const couche of this.couches) delete couche.monde;
    this.dessiner();
    this.surChangement();
  }

  /* ---------- couches ---------- */

  ajouter({ nom, toile, largeurCm }) {
    const cadre = cadreVisible(toile);
    const couche = {
      nom,
      toile,
      cadre,
      largeurCm: largeurCm > 20 ? largeurCm : LARGEUR_PAR_DEFAUT_CM,
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

  /** Taille à laquelle une couche est rendue, en pixels et en px/cm. */
  mesures(couche) {
    const { largeur, hauteur, ancre } = this.#geometrie(couche);
    return { largeurPx: largeur, hauteurPx: hauteur, echelle: largeur / couche.largeurCm / couche.ajustement, ancre };
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
      const { ancre } = this.#geometrie(couche);
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
