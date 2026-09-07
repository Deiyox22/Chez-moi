import { el, toast, confirmDialog, emptyState, formatDate, formatPrice, productImage, progress, remplir } from '../lib/ui.js';
import { STORES, get, put, remove, all, allSorted, photoBlob, photoUrl, savePhoto } from '../lib/db.js';
import { blobToBase64 } from '../lib/images.js';
import { createRender, health } from '../lib/api.js';
import { chargerImage, detourer } from '../lib/montage.js';
import { detourerParModele, segmentationPrete, POIDS_APPROXIMATIF } from '../lib/segmentation.js';
import { EditeurMontage } from '../lib/montage-editeur.js';
import { renderPlan, planLegend } from '../lib/plan.js';
import { lireDimensions } from '../lib/dimensions.js';
import { buildMoodboard, downloadBlob } from '../lib/moodboard.js';

function productRow(product) {
  return el('a', { class: 'product', href: product.url || '#', target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit' } }, [
    el('div', { class: 'product__media' }, [productImage(product)]),
    el('div', { class: 'grow' }, [
      el('div', { class: 'clamp-2', style: { fontWeight: '600', fontSize: '0.94rem' }, text: product.title }),
      el('div', { class: 'small muted', text: `${product.storeName}${product.priceIsIndicative ? ' · prix indicatif' : ''}` }),
    ]),
    el('div', { class: 'product__price', text: formatPrice(product.price, product.currency) }),
  ]);
}

function needCard(need) {
  const live = need.produitsEnLigne || [];
  return el('div', { class: 'card' }, [
    el('div', { class: 'row' }, [
      el('span', { class: `badge badge--${need.priorite || 'bonus'}`, text: need.priorite || 'bonus' }),
      el('h3', { class: 'grow', text: need.besoin, style: { margin: '0' } }),
    ]),
    need.pourquoi ? el('p', { class: 'small muted', text: need.pourquoi }) : null,
    (need.produits || []).length
      ? el('div', {}, (need.produits || []).map(productRow))
      : live.length
        ? null
        : el('p', { class: 'small muted', text: "Aucun produit correspondant dans les catalogues configurés." }),
    live.length
      ? el('div', {}, [
          el('p', { class: 'small muted', style: { margin: '10px 0 2px' }, text: 'Trouvés en ligne sur les sites des magasins :' }),
          ...live.map(productRow),
        ])
      : null,
    el('a', {
      class: 'button button--ghost button--small',
      href: `#/magasins?q=${encodeURIComponent(need.requeteRecherche || need.besoin)}`,
      text: 'Chercher dans les magasins',
    }),
  ]);
}

async function detailView(id) {
  const design = await get(STORES.designs, id);
  if (!design) return emptyState('∅', 'Aménagement introuvable', 'Il a peut-être été supprimé.', el('a', { class: 'button', href: '#/designs', text: 'Retour aux designs' }));

  const room = await get(STORES.rooms, design.roomId);
  const allFurniture = (await all(STORES.furniture)) || [];
  const byId = new Map(allFurniture.map((item) => [item.id, item]));
  const result = design.result || {};
  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('a', { class: 'small muted', href: room ? `#/pieces/${room.id}` : '#/designs', text: room ? `← ${room.nom}` : '← Mes designs' }));
  wrap.appendChild(el('h1', { text: result.titre || 'Aménagement' }));
  wrap.appendChild(
    el('div', { class: 'chips' }, [
      result.directionStyle ? el('span', { class: 'chip chip--accent', text: result.directionStyle }) : null,
      el('span', { class: 'chip', text: formatDate(design.createdAt) }),
      result.budgetEstime
        ? el('span', { class: 'chip', text: `${formatPrice(result.budgetEstime.min, result.budgetEstime.devise || 'EUR')} – ${formatPrice(result.budgetEstime.max, result.budgetEstime.devise || 'EUR')}` })
        : null,
    ])
  );
  if (result.resume) wrap.appendChild(el('p', { text: result.resume }));

  if ((result.palette || []).length) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'Palette' }),
        el('div', { class: 'swatches' }, result.palette.map((color) =>
          el('div', { class: 'swatch' }, [
            el('div', { class: 'swatch__dot', style: { background: color.hex || '#ccc' } }),
            el('span', { text: color.nom || '' }),
          ])
        )),
        el('ul', { class: 'small muted', style: { marginTop: '10px', paddingLeft: '18px' } }, result.palette.map((color) =>
          el('li', { text: `${color.nom} : ${color.usage}` })
        )),
      ])
    );
  }

  if (result.plan?.elements?.length) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'Plan proposé' }),
        el('p', { class: 'small muted', text: `Vue de dessus, ${Math.round(result.plan.largeurCm)} × ${Math.round(result.plan.profondeurCm)} cm. Les dimensions sont estimées à partir des photos : vérifiez au mètre avant d'acheter.` }),
        el('div', { class: 'plan-wrap' }, [renderPlan(result.plan)]),
        planLegend(),
      ])
    );
  }

  if ((result.meublesReutilises || []).length) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'Vos meubles, replacés' }),
        ...result.meublesReutilises.map((entry) => {
          const item = byId.get(entry.meubleId);
          return el('div', { style: { marginBottom: '12px' } }, [
            el('div', { style: { fontWeight: '600' } }, [
              item ? el('a', { href: `#/meubles/${item.id}`, text: entry.libelle }) : el('span', { text: entry.libelle }),
            ]),
            el('p', { class: 'small', style: { margin: '2px 0' }, text: entry.emplacement }),
            entry.ajustement ? el('p', { class: 'small muted', style: { margin: '0' }, text: `À prévoir : ${entry.ajustement}` }) : null,
          ]);
        }),
      ])
    );
  }

  if ((result.meublesEcartes || []).length) {
    wrap.appendChild(
      el('div', { class: 'card card--flat' }, [
        el('h3', { text: 'Meubles mis de côté' }),
        ...result.meublesEcartes.map((entry) =>
          el('div', { style: { marginBottom: '10px' } }, [
            el('div', { style: { fontWeight: '600' }, text: entry.libelle }),
            el('p', { class: 'small muted', style: { margin: '2px 0' }, text: entry.raison }),
            entry.alternative ? el('p', { class: 'small', style: { margin: '0' }, text: `Piste : ${entry.alternative}` }) : null,
          ])
        ),
      ])
    );
  }

  if ((result.zones || []).length) {
    wrap.appendChild(
      el('div', { class: 'card card--flat' }, [
        el('h3', { text: 'Zones' }),
        ...result.zones.map((zone) =>
          el('div', { style: { marginBottom: '10px' } }, [
            el('div', { style: { fontWeight: '600' }, text: `${zone.nom} — ${zone.fonction}` }),
            el('p', { class: 'small muted', style: { margin: '0' }, text: zone.description }),
          ])
        ),
      ])
    );
  }

  if ((result.gainsRapides || []).length) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'À faire tout de suite, sans rien acheter' }),
        el('ul', { class: 'small' }, result.gainsRapides.map((line) => el('li', { text: line }))),
      ])
    );
  }

  if ((result.besoinsAchat || []).length) {
    wrap.appendChild(el('h2', { text: 'Ce qui manque' }));
    if (result.catalogue?.utiliseCatalogueExemple) {
      wrap.appendChild(
        el('p', {
          class: 'notice small',
          text: "Les produits proviennent du catalogue d'exemple embarqué : les prix sont indicatifs et les liens renvoient vers la recherche du magasin. Configurez un vrai flux produit dans config/stores.json pour des références réelles.",
        })
      );
    }
    result.besoinsAchat.forEach((need) => wrap.appendChild(needCard(need)));
  }

  const advice = [
    ['Éclairage', result.eclairage],
    ['Textiles', result.textiles],
  ].filter(([, lines]) => (lines || []).length);
  if (advice.length) {
    wrap.appendChild(
      el('div', { class: 'card card--flat' }, advice.flatMap(([title, lines]) => [
        el('h3', { text: title }),
        el('ul', { class: 'small' }, lines.map((line) => el('li', { text: line }))),
      ]))
    );
  }

  if ((result.etapes || []).length) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'Par où commencer' }),
        el('ol', { class: 'steps' }, [...result.etapes].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)).map((step) =>
          el('li', {}, [
            el('div', { text: step.action }),
            step.coutEstimeEuros ? el('div', { class: 'small muted', text: `≈ ${formatPrice(step.coutEstimeEuros)}` }) : null,
          ])
        )),
      ])
    );
  }

  /* ---------- montage, sans appel facturé ---------- */
  const zoneMontage = el('div', { class: 'card' });

  /**
   * Meubles du projet dont on possède une image exploitable. Deux origines :
   * les fiches boutique, sur fond uni, et vos propres photos, prises dans une
   * pièce — celles-ci demandent le modèle de segmentation.
   */
  function piecesMontables() {
    const pieces = [];
    for (const entree of result.meublesReutilises || []) {
      const item = byId.get(entree.meubleId);
      if (!item) continue;
      // Les cotes servent au moteur : sans profondeur ni hauteur, il ne peut ni
      // dresser le meuble ni savoir l'encombrement qu'il prend au sol.
      const cotes = {
        largeurCm: item.dimensionsEstimeesCm?.largeurCm || 0,
        profondeurCm: item.dimensionsEstimeesCm?.profondeurCm || 0,
        hauteurCm: item.dimensionsEstimeesCm?.hauteurCm || 0,
      };
      if (item.photoIds?.[0]) {
        pieces.push({ nom: item.nom, origine: 'photo', photoId: item.photoIds[0], cle: item.photoIds[0], ...cotes });
      } else if (item.boutique?.imageUrl) {
        pieces.push({ nom: item.nom, origine: 'boutique', url: item.boutique.imageUrl, cle: item.boutique.imageUrl, ...cotes });
      }
    }
    for (const besoin of result.besoinsAchat || []) {
      for (const produit of [...(besoin.produits || []), ...(besoin.produitsEnLigne || [])]) {
        if (produit.imageUrl) {
          // Les fiches boutique annoncent souvent leurs cotes dans le titre.
          const lues = lireDimensions(produit.title, produit.description, produit.dimensions);
          pieces.push({ nom: produit.title, origine: 'boutique', url: produit.imageUrl, cle: produit.imageUrl, ...lues });
        }
      }
    }
    const vues = new Set();
    return pieces.filter((piece) => (vues.has(piece.cle) ? false : vues.add(piece.cle)));
  }

  async function ouvrirMontage() {
    const photoPiece = room?.photoIds?.[0] ? await photoBlob(room.photoIds[0]) : null;
    if (!photoPiece) {
      toast("Cette pièce n'a pas de photo : le montage part de votre photo.", 'error');
      return;
    }
    remplir(zoneMontage, progress('Préparation du montage…'));

    const fond = await createImageBitmap(photoPiece);
    const toile = el('canvas', { class: 'montage-toile' });
    const editeur = new EditeurMontage(toile, fond);

    const echelle = el('input', { type: 'range', min: '1', max: '12', step: '0.1' });
    echelle.value = String(editeur.pxParCm);
    echelle.addEventListener('input', () => editeur.reglerEchelle(Number(echelle.value)));
    const ligneEchelle = el('div', { class: 'reglage' }, [el('span', { text: 'Échelle' }), echelle]);

    const taille = el('input', { type: 'range', min: '0.4', max: '2.5', step: '0.02', value: '1', disabled: true });
    taille.addEventListener('input', () => editeur.reglerTailleSelection(Number(taille.value)));

    const supprimer = el('button', { class: 'button button--danger button--small', text: 'Retirer', disabled: true, onclick: () => editeur.retirerSelection() });

    /* ---------- le moteur : perspective réelle ---------- */
    const orientation = el('input', { type: 'range', min: '-90', max: '90', step: '1', value: '0', disabled: true });
    orientation.addEventListener('input', () => editeur.reglerOrientationSelection((Number(orientation.value) * Math.PI) / 180));
    const ligneOrientation = el('div', { class: 'reglage', hidden: true }, [el('span', { text: 'Pivoter' }), orientation]);

    const lumiere = el('input', { type: 'range', min: '-180', max: '180', step: '5', value: String(editeur.lumiere.azimutDeg) });
    lumiere.addEventListener('input', () => editeur.reglerLumiere({ azimutDeg: Number(lumiere.value) }));
    const ligneLumiere = el('div', { class: 'reglage', hidden: true }, [el('span', { text: 'Lumière' }), lumiere]);

    const zoneMoteur = el('div', { class: 'stack' });

    // Les réglages ne valent que pour le meuble sélectionné : ils suivent la
    // sélection au lieu de rester éteints.
    editeur.surChangement = () => {
      const couche = editeur.selection;
      taille.disabled = !couche;
      supprimer.disabled = !couche;
      orientation.disabled = !couche;
      if (couche) {
        taille.value = String(couche.ajustement);
        orientation.value = String(Math.round(((couche.orientation || 0) * 180) / Math.PI));
      }
    };
    editeur.surChangement();

    /* ---------- calage du sol ---------- */
    const largeurSol = el('input', { type: 'number', min: '50', max: '2000', step: '10', value: '300' });
    const profondeurSol = el('input', { type: 'number', min: '50', max: '2000', step: '10', value: '250' });
    const zoneCalage = el('div', { class: 'stack' });

    /**
     * Le moteur ne s'ouvre qu'une fois le sol calé : c'est le calage qui livre
     * la caméra. On dit ce qu'il apporte plutôt que de le laisser deviner.
     */
    const rendreMoteur = () => {
      const dispo = editeur.volumeDisponible();
      ligneLumiere.hidden = !editeur.volume;
      ligneOrientation.hidden = !editeur.volume;

      if (!dispo) {
        remplir(zoneMoteur, 
          editeur.calage && !editeur.moteur
            ? el('p', { class: 'small muted', style: { margin: '0' }, text: "Ce navigateur n'expose pas WebGL : la perspective réelle est indisponible, le montage reste en collage à plat." })
            : null
        );
        return;
      }

      const cam = editeur.camera;
      remplir(zoneMoteur, 
        el('button', {
          class: editeur.volume ? 'button button--block' : 'button button--soft button--block',
          text: editeur.volume ? '✓ Perspective réelle' : '◨ Passer en perspective réelle',
          onclick: () => { editeur.passerEnVolume(!editeur.volume); rendreMoteur(); },
        }),
        el('p', {
          class: 'small muted',
          style: { margin: '6px 0 0' },
          text: editeur.volume
            ? `Les meubles sont dressés dans la pièce et vus par la caméra de votre photo : ${Math.round(cam.champVerticalDeg)}° de champ, objectif à ${Math.round(cam.hauteurCameraCm)} cm du sol. Leurs verticales fuient comme celles de la pièce, et leur ombre est leur propre silhouette posée au sol.`
            : "À plat, un meuble reste une vignette : ses arêtes verticales restent parallèles alors que celles de la pièce convergent. La perspective réelle le dresse dans la pièce et lui donne son ombre.",
        }),
        !cam.focaleMesuree
          ? el('p', { class: 'small muted', style: { margin: '4px 0 0' }, text: 'La focale ne se déduit pas de ce repère : un objectif courant est supposé. Un repère plus large, et bien à plat, la rendrait mesurable.' })
          : null
      );
    };

    const rendreCalage = () => {
      if (editeur.reperage) {
        remplir(zoneCalage, 
          el('p', {
            class: 'small muted',
            style: { margin: '0' },
            text: 'Déplacez les quatre points pour dessiner un rectangle posé à plat sur le sol — un tapis, un carrelage, ou simplement un coin de pièce — puis donnez ses dimensions réelles.',
          }),
          el('div', { class: 'barre-filtres' }, [
            el('div', {}, [el('label', { text: 'Largeur du repère (cm)' }), largeurSol]),
            el('div', {}, [el('label', { text: 'Profondeur (cm)' }), profondeurSol]),
          ]),
          el('div', { class: 'row' }, [
            el('button', {
              class: 'button grow',
              text: 'Valider le calage',
              onclick: () => {
                const ok = editeur.calerSol(Number(largeurSol.value) || 300, Number(profondeurSol.value) || 250);
                if (!ok) {
                  toast('Les quatre points doivent former un vrai quadrilatère.', 'error');
                  return;
                }
                toast('Sol calé : les meubles suivent maintenant la perspective.');
                rendreMoteur();
                rendreCalage();
              },
            }),
            el('button', { class: 'button button--ghost', text: 'Annuler', onclick: () => { editeur.entrerReperage(false); rendreCalage(); } }),
          ])
        );
        ligneEchelle.hidden = true;
        return;
      }

      if (editeur.calage) {
        ligneEchelle.hidden = true;
        remplir(zoneCalage, 
          el('p', { class: 'notice notice--info small', style: { margin: '0' }, text: 'Sol calé. Un meuble déplacé vers le fond rétrécit tout seul, et passe derrière ceux du premier plan.' }),
          el('div', { class: 'row' }, [
            el('button', { class: 'button button--ghost button--small', text: 'Refaire le calage', onclick: () => { editeur.entrerReperage(true); rendreCalage(); } }),
            el('button', { class: 'button button--ghost button--small', text: 'Retirer le calage', onclick: () => { editeur.annulerCalage(); rendreMoteur(); rendreCalage(); } }),
          ])
        );
        rendreMoteur();
        return;
      }

      ligneEchelle.hidden = false;
      remplir(zoneCalage, 
        el('p', { class: 'small muted', style: { margin: '0' }, text: 'Sans calage, un meuble garde la même taille où qu\'il soit posé. Caler le sol lui fait suivre la perspective.' }),
        el('button', { class: 'button button--soft button--block', text: '◳ Caler le sol', onclick: () => { editeur.entrerReperage(true); rendreCalage(); } })
      );
    };

    const tiroir = el('div', { class: 'tiroir' });
    const pieces = piecesMontables();

    const enregistrer = el('button', {
      class: 'button button--block',
      text: 'Enregistrer le montage',
      onclick: async () => {
        const blob = await editeur.exporter();
        if (!blob) return;
        const photoId = await savePhoto(blob);
        await put(STORES.designs, { ...design, montagePhotoId: photoId });
        design.montagePhotoId = photoId;
        toast('Montage enregistré.');
      },
    });

    remplir(zoneMontage, 
      el('h3', { text: 'Montage' }),
      el('p', {
        class: 'small muted',
        text: "Posez les meubles sur votre photo et déplacez-les au doigt. Gratuit et illimité : tout se calcule dans votre navigateur. Calez le sol une fois, et chaque meuble prendra la taille que lui donne sa distance.",
      }),
      toile,
      zoneCalage,
      zoneMoteur,
      ligneEchelle,
      el('div', { class: 'reglage' }, [el('span', { text: 'Taille' }), taille, supprimer]),
      ligneOrientation,
      ligneLumiere,
      pieces.length
        ? el('div', {}, [
            el('p', { class: 'small muted', style: { margin: '10px 0 6px' }, text: 'Touchez un meuble pour le poser :' }),
            tiroir,
            pieces.some((piece) => piece.origine === 'photo')
              ? el('p', {
                  class: 'small muted',
                  style: { margin: '6px 0 0' },
                  text: `Vos propres photos sont détourées par un modèle qui s'exécute sur votre appareil : elles ne partent nulle part. Premier usage, ${Math.round(POIDS_APPROXIMATIF / 1024 / 1024)} Mo à télécharger une fois, puis environ deux secondes par photo.`,
                })
              : null,
          ])
        : el('p', { class: 'notice small', text: "Aucun meuble de ce projet n'a de photo boutique. Ajoutez des produits depuis le catalogue pour les incruster." }),
      enregistrer
    );
    rendreMoteur();
    rendreCalage();

    const poidsMo = Math.round(POIDS_APPROXIMATIF / 1024 / 1024);

    async function poserPhotoPersonnelle(piece, bouton) {
      const libelle = bouton.querySelector('.tiroir-piece__nom');
      const texteInitial = libelle.textContent;
      bouton.disabled = true;
      libelle.textContent = segmentationPrete() ? 'Détourage…' : `Téléchargement (${poidsMo} Mo)…`;
      try {
        const blob = await photoBlob(piece.photoId);
        const bitmap = await createImageBitmap(blob);
        const { toile: decoupe, couverture } = await detourerParModele(bitmap, (etape) => {
          libelle.textContent = { runtime: 'Préparation…', modele: 'Modèle chargé…', calcul: 'Détourage…' }[etape] || 'Détourage…';
        });
        if (couverture < 0.01) {
          toast("Le modèle n'a rien trouvé à détourer sur cette photo.", 'error');
          return;
        }
        editeur.ajouter({ nom: piece.nom, toile: decoupe, largeurCm: piece.largeurCm, profondeurCm: piece.profondeurCm, hauteurCm: piece.hauteurCm });
      } catch (erreur) {
        toast(`Détourage impossible : ${erreur.message}`, 'error');
      } finally {
        libelle.textContent = texteInitial;
        bouton.disabled = false;
      }
    }

    for (const piece of pieces) {
      const bouton = el('button', { class: 'tiroir-piece', type: 'button', disabled: true }, [
        el('div', { class: 'skeleton', style: { width: '100%', aspectRatio: '1' } }),
        el('div', { class: 'tiroir-piece__nom', text: piece.nom }),
      ]);
      tiroir.appendChild(bouton);

      if (piece.origine === 'photo') {
        photoUrl(piece.photoId)
          .then((url) => {
            remplir(bouton, 
              el('img', { class: 'tiroir-piece__image', src: url, alt: '' }),
              el('div', { class: 'tiroir-piece__nom', text: piece.nom })
            );
            bouton.disabled = false;
            bouton.title = 'Votre photo — détourage par le modèle, sur votre appareil';
            bouton.addEventListener('click', () => poserPhotoPersonnelle(piece, bouton));
          })
          .catch(() => {
            remplir(bouton, el('div', { class: 'tiroir-piece__nom', text: `${piece.nom} — photo illisible` }));
          });
        continue;
      }

      chargerImage(piece.url)
        .then((bitmap) => {
          if (!bitmap) throw new Error('image illisible');
          const { toile: decoupe, detoure } = detourer(bitmap);
          const vignette = el('img', { class: 'tiroir-piece__image', alt: '' });
          remplir(bouton, vignette, el('div', { class: 'tiroir-piece__nom', text: piece.nom }));
          decoupe.convertToBlob({ type: 'image/png' }).then((blob) => {
            vignette.src = URL.createObjectURL(blob);
          });
          bouton.disabled = false;
          bouton.title = detoure ? 'Détouré automatiquement' : 'Fond non détourable : posé tel quel';
          bouton.addEventListener('click', () =>
            editeur.ajouter({ nom: piece.nom, toile: decoupe, largeurCm: piece.largeurCm, profondeurCm: piece.profondeurCm, hauteurCm: piece.hauteurCm })
          );
        })
        .catch(() => {
          remplir(bouton, el('div', { class: 'tiroir-piece__nom', text: `${piece.nom} — image indisponible` }));
        });
    }
  }

  if (design.montagePhotoId) {
    const url = await photoUrl(design.montagePhotoId);
    remplir(zoneMontage, 
      el('h3', { text: 'Montage' }),
      url ? el('img', { class: 'rendu', src: url, alt: 'Montage de la pièce' }) : null,
      el('button', { class: 'button button--soft', text: 'Reprendre le montage', onclick: ouvrirMontage })
    );
  } else {
    remplir(zoneMontage, 
      el('h3', { text: 'Montage' }),
      el('p', {
        class: 'small muted',
        text: "Incrustez les meubles sur votre photo, à leurs proportions réelles. Gratuit, hors ligne, refaisable à volonté.",
      }),
      el('button', { class: 'button button--block', text: '◱ Ouvrir le montage', onclick: ouvrirMontage })
    );
  }
  wrap.appendChild(zoneMontage);

  /* ---------- rendu photographique ---------- */
  const zoneRendu = el('div', { class: 'card' });

  async function afficherRendu(photoId) {
    const url = await photoUrl(photoId);
    remplir(zoneRendu, 
      el('h3', { text: 'Votre pièce, réaménagée' }),
      url ? el('img', { class: 'rendu', src: url, alt: `Rendu de ${room?.nom || 'la pièce'} réaménagée` }) : null,
      el('p', {
        class: 'small muted',
        text: "Illustration générée à partir de votre photo et des meubles retenus. Les cotes du plan font foi, pas cette image.",
      }),
      el('button', { class: 'button button--ghost button--small', text: 'Générer un autre rendu', onclick: lancerRendu })
    );
  }

  async function lancerRendu() {
    const photoPiece = room?.photoIds?.[0] ? await photoBlob(room.photoIds[0]) : null;
    if (!photoPiece) {
      toast("Cette pièce n'a pas de photo : le rendu part de votre photo.", 'error');
      return;
    }
    remplir(zoneRendu, progress('Composition du rendu, cela peut prendre une minute…'));

    try {
      const meubles = [];
      for (const entree of result.meublesReutilises || []) {
        const item = byId.get(entree.meubleId);
        if (!item) continue;
        if (item.photoIds?.[0]) {
          const blob = await photoBlob(item.photoIds[0]);
          if (blob) {
            meubles.push({ titre: item.nom, image: { media_type: 'image/jpeg', data: await blobToBase64(blob) } });
            continue;
          }
        }
        if (item.boutique?.imageUrl) meubles.push({ titre: item.nom, imageUrl: item.boutique.imageUrl });
      }

      const reponse = await createRender({
        images: [{ media_type: 'image/jpeg', data: await blobToBase64(photoPiece) }],
        meubles,
        consignes: [result.directionStyle, (result.palette || []).map((c) => c.nom).join(', ')].filter(Boolean).join(' — '),
      });

      const octets = Uint8Array.from(atob(reponse.image.data), (c) => c.charCodeAt(0));
      const photoId = await savePhoto(new Blob([octets], { type: reponse.image.media_type }));
      await put(STORES.designs, { ...design, renduPhotoId: photoId });
      design.renduPhotoId = photoId;
      await afficherRendu(photoId);
      toast('Rendu généré.');
    } catch (erreur) {
      remplir(zoneRendu, 
        el('h3', { text: 'Votre pièce, réaménagée' }),
        el('p', { class: 'notice small', text: erreur.message }),
        el('button', { class: 'button button--soft', text: 'Réessayer', onclick: lancerRendu })
      );
    }
  }

  if (design.renduPhotoId) {
    await afficherRendu(design.renduPhotoId);
  } else {
    const cout = el('p', { class: 'small muted', style: { margin: '0' } });
    remplir(zoneRendu, 
      el('h3', { text: 'Votre pièce, réaménagée' }),
      el('p', {
        class: 'small muted',
        text: 'Une image de votre pièce avec les meubles retenus, composée à partir de votre photo.',
      }),
      el('button', { class: 'button button--block', text: '✦ Générer le rendu', onclick: lancerRendu }),
      cout
    );
    // Le rendu est le seul geste facture a l'image : autant l'annoncer avant.
    health()
      .then((etat) => {
        if (etat.renduPrixIndicatif) {
          cout.textContent = `Environ ${etat.renduPrixIndicatif.toFixed(2).replace('.', ',')} € par rendu, facturés sur votre compte ${etat.fournisseur}. Le reste de l'application coûte des fractions de centime.`;
        }
      })
      .catch(() => {});
  }
  wrap.appendChild(zoneRendu);

  const exportButton = el('button', { class: 'button button--soft grow', text: 'Exporter le moodboard' });
  exportButton.addEventListener('click', async () => {
    exportButton.disabled = true;
    exportButton.textContent = 'Génération…';
    try {
      const reused = (result.meublesReutilises || []).map((entry) => byId.get(entry.meubleId)).filter(Boolean);
      const blob = await buildMoodboard(design, room, reused);
      if (blob) downloadBlob(blob, `chez-moi-${(result.titre || 'moodboard').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.png`);
      toast('Moodboard enregistré.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = 'Exporter le moodboard';
    }
  });

  wrap.appendChild(
    el('div', { class: 'row' }, [
      exportButton,
      el('button', {
        class: 'button button--danger',
        text: 'Supprimer',
        onclick: async () => {
          if (!(await confirmDialog('Supprimer cet aménagement ?'))) return;
          await remove(STORES.designs, design.id);
          toast('Aménagement supprimé.');
          location.hash = '#/designs';
        },
      }),
    ])
  );

  return wrap;
}

async function listView() {
  const designs = await allSorted(STORES.designs);
  const rooms = (await all(STORES.rooms)) || [];
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('h1', { text: 'Mes aménagements' }));

  if (!designs.length) {
    wrap.appendChild(
      emptyState(
        '✦',
        'Aucun aménagement',
        "Ouvrez une pièce et lancez une proposition. Elle partira de vos meubles avant de suggérer quoi que ce soit à acheter.",
        el('a', { class: 'button', style: { marginTop: '12px' }, href: '#/pieces', text: 'Voir mes pièces' })
      )
    );
    return wrap;
  }

  for (const design of designs) {
    const room = roomsById.get(design.roomId);
    const result = design.result || {};
    wrap.appendChild(
      el('a', { class: 'card', href: `#/designs/${design.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, [
        el('h3', { text: result.titre || 'Aménagement' }),
        el('div', { class: 'chips' }, [
          room ? el('span', { class: 'chip chip--accent', text: room.nom }) : null,
          el('span', { class: 'chip', text: formatDate(design.createdAt) }),
          (result.besoinsAchat || []).length ? el('span', { class: 'chip', text: `${result.besoinsAchat.length} achat(s) suggéré(s)` }) : null,
        ]),
        result.resume ? el('p', { class: 'small muted', style: { marginTop: '8px' }, text: result.resume.slice(0, 160) }) : null,
      ])
    );
  }

  return wrap;
}

export async function render({ params, action }) {
  return action === 'detail' ? detailView(params.id) : listView();
}
