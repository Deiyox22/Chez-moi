/**
 * L'éditeur de montage : une photo de pièce, des meubles détourés posés dessus,
 * déplaçables au doigt.
 *
 * Deux échelles cohabitent. Celle de la pièce — combien de pixels vaut un
 * centimètre — ne peut pas se déduire d'une photo, alors elle se règle à la
 * main, une fois. Celle des meubles en découle : chacun est dessiné à sa
 * largeur réelle, si bien qu'un canapé de 210 cm reste exactement 1,75 fois
 * plus large qu'une étagère de 120 cm, quel que soit le réglage.
 */

import { cadreVisible } from './montage.js';

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
    this.pxParCm = fond.width / 400; // une pièce de 4 m de large, à ajuster
    this.surChangement = () => {};
    this.#brancherGestes();
    this.dessiner();
  }

  ajouter({ nom, toile, largeurCm }) {
    const cadre = cadreVisible(toile);
    const couche = {
      nom,
      toile,
      cadre,
      largeurCm: largeurCm > 20 ? largeurCm : LARGEUR_PAR_DEFAUT_CM,
      ajustement: 1,
      // On pose le meuble au centre, un peu bas : c'est là que se trouve le sol.
      x: this.fond.width / 2,
      y: this.fond.height * 0.78,
    };

    // Un meuble qui déborde de la photo dès sa pose n'aide personne à juger :
    // on le rentre dans le cadre, à charge pour l'échelle d'être ajustée ensuite.
    const { largeur, hauteur } = this.#geometrie(couche);
    const debordement = Math.max(largeur / (this.fond.width * 0.8), hauteur / (this.fond.height * 0.7));
    if (debordement > 1) couche.ajustement = 1 / debordement;

    this.couches.push(couche);
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

  /** Géométrie d'une couche : largeur réelle × échelle, ancrée par son pied. */
  #geometrie(couche) {
    const largeur = couche.largeurCm * this.pxParCm * couche.ajustement;
    const ratio = couche.cadre.hauteur / couche.cadre.largeur;
    const hauteur = largeur * ratio;
    return { largeur, hauteur, x: couche.x - largeur / 2, y: couche.y - hauteur };
  }

  dessiner() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.fond, 0, 0);

    // Ce qui est plus bas dans l'image est plus près : dessiné en dernier.
    const ordre = [...this.couches].sort((a, b) => a.y - b.y);
    for (const couche of ordre) {
      const { largeur, hauteur, x, y } = this.#geometrie(couche);

      // Une ombre au sol, discrète, suffit à décoller le meuble du fond.
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(couche.x, couche.y, largeur * 0.42, hauteur * 0.06, 0, 0, Math.PI * 2);
      ctx.filter = 'blur(6px)';
      ctx.fill();
      ctx.restore();

      ctx.drawImage(
        couche.toile,
        couche.cadre.x, couche.cadre.y, couche.cadre.largeur, couche.cadre.hauteur,
        x, y, largeur, hauteur
      );

      if (couche === this.selection) {
        ctx.save();
        ctx.strokeStyle = '#b5613f';
        ctx.lineWidth = Math.max(2, this.canvas.width / 320);
        ctx.setLineDash([10, 8]);
        ctx.strokeRect(x, y, largeur, hauteur);
        ctx.restore();
      }
    }
  }

  #pointVers(evenement) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((evenement.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((evenement.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  #coucheSous(point) {
    const ordre = [...this.couches].sort((a, b) => b.y - a.y);
    return (
      ordre.find((couche) => {
        const { largeur, hauteur, x, y } = this.#geometrie(couche);
        return point.x >= x && point.x <= x + largeur && point.y >= y && point.y <= y + hauteur;
      }) || null
    );
  }

  #brancherGestes() {
    let deplacement = null;

    this.canvas.addEventListener('pointerdown', (evenement) => {
      const point = this.#pointVers(evenement);
      const couche = this.#coucheSous(point);
      this.selection = couche;
      this.surChangement();
      if (!couche) {
        this.dessiner();
        return;
      }
      deplacement = { couche, dx: couche.x - point.x, dy: couche.y - point.y };
      this.canvas.setPointerCapture(evenement.pointerId);
      this.dessiner();
    });

    this.canvas.addEventListener('pointermove', (evenement) => {
      if (!deplacement) return;
      evenement.preventDefault();
      const point = this.#pointVers(evenement);
      deplacement.couche.x = point.x + deplacement.dx;
      deplacement.couche.y = point.y + deplacement.dy;
      this.dessiner();
    });

    const relacher = () => { deplacement = null; };
    this.canvas.addEventListener('pointerup', relacher);
    this.canvas.addEventListener('pointercancel', relacher);
  }

  /** Export sans le cadre de sélection. */
  async exporter() {
    const selection = this.selection;
    this.selection = null;
    this.dessiner();
    const blob = await new Promise((resoudre) => this.canvas.toBlob(resoudre, 'image/jpeg', 0.9));
    this.selection = selection;
    this.dessiner();
    return blob;
  }
}
