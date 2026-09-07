import { el, toast, confirmDialog, emptyState, formatDate, formatPrice, productImage, progress } from '../lib/ui.js';
import { STORES, get, put, remove, all, allSorted, photoBlob, photoUrl, savePhoto } from '../lib/db.js';
import { blobToBase64 } from '../lib/images.js';
import { createRender, health } from '../lib/api.js';
import { chargerImage, detourer } from '../lib/montage.js';
import { EditeurMontage } from '../lib/montage-editeur.js';
import { renderPlan, planLegend } from '../lib/plan.js';
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

  /** Meubles du projet dont on possède une image exploitable. */
  function piecesMontables() {
    const pieces = [];
    for (const entree of result.meublesReutilises || []) {
      const item = byId.get(entree.meubleId);
      if (item?.boutique?.imageUrl) {
        pieces.push({
          nom: item.nom,
          url: item.boutique.imageUrl,
          largeurCm: item.dimensionsEstimeesCm?.largeurCm || 0,
        });
      }
    }
    for (const besoin of result.besoinsAchat || []) {
      for (const produit of [...(besoin.produits || []), ...(besoin.produitsEnLigne || [])]) {
        if (produit.imageUrl) {
          pieces.push({ nom: produit.title, url: produit.imageUrl, largeurCm: 0 });
        }
      }
    }
    // Un même produit peut venir de deux endroits.
    const vues = new Set();
    return pieces.filter((piece) => (vues.has(piece.url) ? false : vues.add(piece.url)));
  }

  async function ouvrirMontage() {
    const photoPiece = room?.photoIds?.[0] ? await photoBlob(room.photoIds[0]) : null;
    if (!photoPiece) {
      toast("Cette pièce n'a pas de photo : le montage part de votre photo.", 'error');
      return;
    }
    zoneMontage.replaceChildren(progress('Préparation du montage…'));

    const fond = await createImageBitmap(photoPiece);
    const toile = el('canvas', { class: 'montage-toile' });
    const editeur = new EditeurMontage(toile, fond);

    const echelle = el('input', { type: 'range', min: '1', max: '12', step: '0.1', value: String(fond.width / 400 / 1) });
    echelle.value = String(editeur.pxParCm);
    echelle.addEventListener('input', () => editeur.reglerEchelle(Number(echelle.value)));

    const taille = el('input', { type: 'range', min: '0.4', max: '2.5', step: '0.02', value: '1', disabled: true });
    taille.addEventListener('input', () => editeur.reglerTailleSelection(Number(taille.value)));

    const supprimer = el('button', { class: 'button button--danger button--small', text: 'Retirer', disabled: true, onclick: () => editeur.retirerSelection() });

    editeur.surChangement = () => {
      const actif = Boolean(editeur.selection);
      taille.disabled = !actif;
      supprimer.disabled = !actif;
      if (actif) taille.value = String(editeur.selection.ajustement);
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

    zoneMontage.replaceChildren(
      el('h3', { text: 'Montage' }),
      el('p', {
        class: 'small muted',
        text: "Posez les meubles sur votre photo et déplacez-les au doigt. Gratuit et illimité : tout se calcule dans votre navigateur. Les proportions entre meubles sont exactes ; réglez d'abord l'échelle de la pièce.",
      }),
      toile,
      el('div', { class: 'reglage' }, [el('span', { text: 'Échelle' }), echelle]),
      el('div', { class: 'reglage' }, [el('span', { text: 'Taille' }), taille, supprimer]),
      pieces.length
        ? el('div', {}, [el('p', { class: 'small muted', style: { margin: '10px 0 6px' }, text: 'Touchez un meuble pour le poser :' }), tiroir])
        : el('p', { class: 'notice small', text: "Aucun meuble de ce projet n'a de photo boutique. Ajoutez des produits depuis le catalogue pour les incruster." }),
      enregistrer
    );

    for (const piece of pieces) {
      const bouton = el('button', { class: 'tiroir-piece', type: 'button', disabled: true }, [
        el('div', { class: 'skeleton', style: { width: '100%', aspectRatio: '1' } }),
        el('div', { class: 'tiroir-piece__nom', text: piece.nom }),
      ]);
      tiroir.appendChild(bouton);

      chargerImage(piece.url)
        .then((bitmap) => {
          if (!bitmap) throw new Error('image illisible');
          const { toile: decoupe, detoure } = detourer(bitmap);
          const vignette = el('img', { class: 'tiroir-piece__image', alt: '' });
          bouton.replaceChildren(vignette, el('div', { class: 'tiroir-piece__nom', text: piece.nom }));
          // OffscreenCanvas n'expose pas toDataURL : la vignette passe par un blob.
          decoupe.convertToBlob({ type: 'image/png' }).then((blob) => {
            vignette.src = URL.createObjectURL(blob);
          });
          bouton.disabled = false;
          bouton.title = detoure ? 'Détouré automatiquement' : 'Fond non détourable : posé tel quel';
          bouton.addEventListener('click', () => editeur.ajouter({ nom: piece.nom, toile: decoupe, largeurCm: piece.largeurCm }));
        })
        .catch(() => {
          bouton.replaceChildren(el('div', { class: 'tiroir-piece__nom', text: `${piece.nom} — image indisponible` }));
        });
    }
  }

  if (design.montagePhotoId) {
    const url = await photoUrl(design.montagePhotoId);
    zoneMontage.replaceChildren(
      el('h3', { text: 'Montage' }),
      url ? el('img', { class: 'rendu', src: url, alt: 'Montage de la pièce' }) : null,
      el('button', { class: 'button button--soft', text: 'Reprendre le montage', onclick: ouvrirMontage })
    );
  } else {
    zoneMontage.replaceChildren(
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
    zoneRendu.replaceChildren(
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
    zoneRendu.replaceChildren(progress('Composition du rendu, cela peut prendre une minute…'));

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
      zoneRendu.replaceChildren(
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
    zoneRendu.replaceChildren(
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
