import { el, toast, openModal, confirmDialog, emptyState, progress, uid, formatDate } from '../lib/ui.js';
import { STORES, put, get, remove, allSorted, all, savePhoto, photoUrl, deletePhoto } from '../lib/db.js';
import { normalizeImage, pickImages, captureFromCamera, blobsToImagePayload } from '../lib/images.js';
import { analyzeRoom, createDesign } from '../lib/api.js';

const ROOM_TYPES = [
  'salon', 'chambre', 'cuisine', 'salle_a_manger', 'bureau', 'salle_de_bain',
  'entree', 'couloir', 'studio', 'chambre_enfant', 'buanderie', 'balcon', 'autre',
];

const ROOM_LABELS = {
  salon: 'Salon', chambre: 'Chambre', cuisine: 'Cuisine', salle_a_manger: 'Salle à manger',
  bureau: 'Bureau', salle_de_bain: 'Salle de bain', entree: 'Entrée', couloir: 'Couloir',
  studio: 'Studio', chambre_enfant: "Chambre d'enfant", buanderie: 'Buanderie', balcon: 'Balcon', autre: 'Autre',
};

export const roomLabel = (key) => ROOM_LABELS[key] || key || 'Pièce';

const STYLE_SUGGESTIONS = [
  'scandinave', 'contemporain', 'mid-century', 'bohème', 'industriel', 'minimaliste',
  'campagne chic', 'art déco', 'japandi', 'méditerranéen',
];

async function collectPhotos() {
  return new Promise((resolve) => {
    const close = openModal('Photos de la pièce', (dismiss) =>
      el('div', { class: 'stack' }, [
        el('p', { class: 'small muted', text: "Prenez la pièce depuis deux ou trois angles, en cadrant les murs et le sol. Plus la pièce est visible, meilleur est le plan." }),
        el('button', {
          class: 'button button--block',
          text: 'Prendre des photos',
          onclick: async () => { dismiss(); resolve(await captureFromCamera({ openModal })); },
        }),
        el('button', {
          class: 'button button--ghost button--block',
          text: 'Choisir dans la galerie',
          onclick: async () => {
            dismiss();
            const files = await pickImages({ multiple: true });
            resolve(await Promise.all(files.map(normalizeImage)));
          },
        }),
      ])
    );
    void close;
  });
}

async function thumbGrid(photoIds) {
  const grid = el('div', { class: 'photo-strip' });
  for (const photoId of photoIds) {
    const url = await photoUrl(photoId);
    grid.appendChild(el('div', { class: 'thumb' }, [url ? el('img', { src: url, alt: '' }) : null]));
  }
  return grid;
}

/* ---------------- add flow ---------------- */

async function startAddFlow(onDone) {
  const blobs = await collectPhotos();
  if (!blobs.length) return;

  const photoIds = [];
  for (const blob of blobs) photoIds.push(await savePhoto(blob));

  const nameInput = el('input', { type: 'text', placeholder: 'Salon, chambre, bureau… (facultatif)' });
  const notesInput = el('textarea', { placeholder: "Ce que vous voulez en faire, ce qui vous gêne aujourd'hui… (facultatif)" });
  const status = el('div');

  const close = openModal('Nouvelle pièce', (dismiss) => {
    const analyseButton = el('button', { class: 'button button--block', text: 'Analyser la pièce' });
    const skipButton = el('button', { class: 'button button--ghost button--block', text: 'Enregistrer sans analyse' });

    const save = async (analysis) => {
      const room = {
        id: uid('piece'),
        createdAt: new Date().toISOString(),
        photoIds,
        nom: nameInput.value.trim() || analysis?.nomPropose || 'Pièce sans nom',
        nomDonneParUtilisateur: Boolean(nameInput.value.trim()),
        notes: notesInput.value.trim(),
        analyse: analysis || null,
        type: analysis?.type || 'autre',
      };
      await put(STORES.rooms, room);
      dismiss();
      toast('Pièce enregistrée.');
      onDone(room);
    };

    analyseButton.addEventListener('click', async () => {
      analyseButton.disabled = true;
      skipButton.disabled = true;
      status.replaceChildren(progress('Relevé de la pièce en cours…'));
      try {
        const images = await blobsToImagePayload(blobs);
        const analysis = await analyzeRoom({ images, name: nameInput.value.trim(), notes: notesInput.value.trim() });
        delete analysis.usage;
        await save(analysis);
      } catch (error) {
        status.replaceChildren(el('p', { class: 'notice small', text: error.message }));
        analyseButton.disabled = false;
        skipButton.disabled = false;
      }
    });

    skipButton.addEventListener('click', () => save(null));

    const photoBox = el('div');
    thumbGrid(photoIds).then((grid) => photoBox.replaceChildren(grid));

    return el('div', { class: 'stack' }, [
      photoBox,
      el('div', { class: 'field' }, [el('label', { text: 'Nom de la pièce (facultatif)' }), nameInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Notes (facultatif)' }), notesInput]),
      analyseButton,
      skipButton,
      status,
    ]);
  });
  void close;
}

/* ---------------- design generation ---------------- */

async function startDesignFlow(room) {
  const furniture = (await all(STORES.furniture)) || [];
  if (!furniture.length) {
    toast("Ajoutez d'abord au moins un meuble : l'aménagement part de ce que vous possédez.", 'error');
    location.hash = '#/meubles';
    return;
  }

  const close = openModal('Générer un aménagement', (dismiss) => {
    const styleInput = el('input', { type: 'text', list: 'styles-list', placeholder: 'Laisser vide pour déduire de vos meubles' });
    const styleList = el('datalist', { id: 'styles-list' }, STYLE_SUGGESTIONS.map((style) => el('option', { value: style })));
    const budgetInput = el('input', { type: 'number', min: '0', step: '50', placeholder: '500' });
    const usagesInput = el('input', { type: 'text', placeholder: 'télétravail, recevoir, lecture…' });
    const avoidInput = el('input', { type: 'text', placeholder: 'ce que vous ne voulez pas' });
    const childrenBox = el('input', { type: 'checkbox' });
    const petsBox = el('input', { type: 'checkbox' });
    const rentingBox = el('input', { type: 'checkbox' });

    const selection = new Map(furniture.map((item) => [item.id, true]));
    const furnitureList = el('div', { class: 'stack' }, furniture.map((item) => {
      const box = el('input', { type: 'checkbox', checked: true, onchange: (event) => selection.set(item.id, event.target.checked) });
      return el('label', { class: 'checkbox' }, [box, el('span', { text: item.nom })]);
    }));

    const status = el('div');
    const generateButton = el('button', { class: 'button button--block', text: 'Générer la proposition' });

    generateButton.addEventListener('click', async () => {
      generateButton.disabled = true;
      status.replaceChildren(progress('Conception en cours, cela peut prendre une minute…'));
      try {
        const chosen = furniture.filter((item) => selection.get(item.id));
        if (!chosen.length) throw new Error('Sélectionnez au moins un meuble.');

        const photoIds = (room.photoIds || []).slice(0, 3);
        const blobs = [];
        for (const photoId of photoIds) {
          const { photoBlob } = await import('../lib/db.js');
          const blob = await photoBlob(photoId);
          if (blob) blobs.push(blob);
        }

        const result = await createDesign({
          room: { ...(room.analyse || {}), nom: room.nom, type: room.type, notes: room.notes },
          furniture: chosen.map((item) => ({
            id: item.id,
            nom: item.nom,
            categorie: item.categorie,
            styles: item.styles,
            couleurs: item.couleurs,
            materiaux: item.materiaux,
            dimensionsEstimeesCm: item.dimensionsEstimeesCm,
            etat: item.etat,
            particularites: item.particularites,
          })),
          preferences: {
            style: styleInput.value.trim(),
            budget: budgetInput.value ? Number(budgetInput.value) : null,
            usages: usagesInput.value.split(',').map((value) => value.trim()).filter(Boolean),
            avoid: avoidInput.value.split(',').map((value) => value.trim()).filter(Boolean),
            children: childrenBox.checked,
            pets: petsBox.checked,
            renting: rentingBox.checked,
          },
          images: await blobsToImagePayload(blobs),
        });
        delete result.usage;

        const design = {
          id: uid('design'),
          roomId: room.id,
          createdAt: new Date().toISOString(),
          furnitureIds: chosen.map((item) => item.id),
          result,
        };
        await put(STORES.designs, design);
        dismiss();
        toast('Aménagement généré.');
        location.hash = `#/designs/${design.id}`;
      } catch (error) {
        status.replaceChildren(el('p', { class: 'notice small', text: error.message }));
        generateButton.disabled = false;
      }
    });

    return el('div', { class: 'stack' }, [
      el('div', { class: 'field' }, [el('label', { text: 'Style souhaité (facultatif)' }), styleInput, styleList]),
      el('div', { class: 'field' }, [el('label', { text: 'Budget maximum en euros (facultatif)' }), budgetInput]),
      el('div', { class: 'field' }, [el('label', { text: 'Usages de la pièce' }), usagesInput]),
      el('div', { class: 'field' }, [el('label', { text: 'À éviter' }), avoidInput]),
      el('div', { class: 'row' }, [
        el('label', { class: 'checkbox' }, [childrenBox, el('span', { text: 'Enfants' })]),
        el('label', { class: 'checkbox' }, [petsBox, el('span', { text: 'Animaux' })]),
        el('label', { class: 'checkbox' }, [rentingBox, el('span', { text: 'Locataire' })]),
      ]),
      el('hr', { class: 'sep' }),
      el('div', {}, [el('label', { text: 'Meubles à prendre en compte' }), furnitureList]),
      generateButton,
      status,
    ]);
  });
  void close;
}

/* ---------------- views ---------------- */

async function listView(query) {
  const rooms = await allSorted(STORES.rooms);
  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: 'Mes pièces' }),
        el('p', { class: 'small muted', text: 'Le nom est facultatif : chambre, salon, ou rien du tout.' }),
      ]),
      el('button', { class: 'button', text: '＋ Ajouter', onclick: () => startAddFlow(() => location.reload()) }),
    ])
  );

  if (!rooms.length) {
    wrap.appendChild(
      emptyState(
        '▤',
        'Aucune pièce enregistrée',
        "Envoyez les photos d'une pièce de votre appartement. L'app en fait le relevé, puis propose un aménagement.",
        el('button', { class: 'button', style: { marginTop: '12px' }, text: 'Photographier une pièce', onclick: () => startAddFlow(() => location.reload()) })
      )
    );
  } else {
    for (const room of rooms) {
      const url = room.photoIds?.[0] ? await photoUrl(room.photoIds[0]) : null;
      wrap.appendChild(
        el('a', { class: 'card item-card', href: `#/pieces/${room.id}`, style: { textDecoration: 'none', color: 'inherit' } }, [
          el('div', { class: 'item-card__thumb' }, [url ? el('img', { src: url, alt: '' }) : null]),
          el('div', { class: 'grow' }, [
            el('h3', { text: room.nom, style: { marginBottom: '4px' } }),
            el('div', { class: 'chips' }, [
              el('span', { class: 'chip chip--accent', text: roomLabel(room.type) }),
              room.analyse?.surfaceEstimeeM2 ? el('span', { class: 'chip', text: `≈ ${Math.round(room.analyse.surfaceEstimeeM2)} m²` }) : null,
              room.analyse ? null : el('span', { class: 'chip', text: 'non analysée' }),
            ]),
          ]),
        ])
      );
    }
  }

  if (query.get('ajouter') === '1') setTimeout(() => startAddFlow(() => location.reload()), 60);
  return wrap;
}

async function detailView(id) {
  const room = await get(STORES.rooms, id);
  if (!room) return emptyState('∅', 'Pièce introuvable', 'Elle a peut-être été supprimée.', el('a', { class: 'button', href: '#/pieces', text: 'Retour aux pièces' }));

  const designs = ((await all(STORES.designs)) || []).filter((design) => design.roomId === room.id);
  const analysis = room.analyse;
  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(el('a', { class: 'small muted', href: '#/pieces', text: '← Mes pièces' }));
  wrap.appendChild(el('h1', { text: room.nom }));
  wrap.appendChild(
    el('div', { class: 'chips' }, [
      el('span', { class: 'chip chip--accent', text: roomLabel(room.type) }),
      el('span', { class: 'chip', text: `ajoutée le ${formatDate(room.createdAt)}` }),
    ])
  );
  wrap.appendChild(await thumbGrid(room.photoIds || []));

  if (analysis) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('h3', { text: 'Relevé de la pièce' }),
        el('p', { class: 'small', html: `<strong>Surface estimée</strong> ≈ ${Math.round(analysis.surfaceEstimeeM2 || 0)} m², hauteur ≈ ${(analysis.hauteurSousPlafondM || 0).toFixed(2)} m` }),
        el('p', { class: 'small', html: `<strong>Luminosité</strong> ${analysis.luminosite || '—'} · ${analysis.fenetres || 0} fenêtre(s), ${analysis.portes || 0} porte(s)` }),
        analysis.sol ? el('p', { class: 'small', html: `<strong>Sol</strong> ${analysis.sol}` }) : null,
        analysis.styleExistant ? el('p', { class: 'small', html: `<strong>Style actuel</strong> ${analysis.styleExistant}` }) : null,
        (analysis.couleursMurs || []).length
          ? el('div', { class: 'swatches', style: { margin: '10px 0' } }, analysis.couleursMurs.map((color) =>
              el('div', { class: 'swatch' }, [
                el('div', { class: 'swatch__dot', style: { background: color.hex || '#ccc' } }),
                el('span', { text: color.name || color.nom || '' }),
              ])
            ))
          : null,
        (analysis.contraintes || []).length
          ? el('div', {}, [el('p', { class: 'small', html: '<strong>Contraintes</strong>' }), el('ul', { class: 'small' }, analysis.contraintes.map((line) => el('li', { text: line })))])
          : null,
        (analysis.pointsForts || []).length
          ? el('div', {}, [el('p', { class: 'small', html: '<strong>Points forts</strong>' }), el('ul', { class: 'small' }, analysis.pointsForts.map((line) => el('li', { text: line })))])
          : null,
      ])
    );
  } else {
    wrap.appendChild(el('p', { class: 'notice small', text: "Cette pièce n'a pas encore été analysée. L'aménagement sera moins précis." }));
  }

  if (room.notes) wrap.appendChild(el('div', { class: 'card card--flat' }, [el('h3', { text: 'Vos notes' }), el('p', { class: 'small', text: room.notes })]));

  wrap.appendChild(el('button', { class: 'button button--block', text: '✦ Générer un aménagement', onclick: () => startDesignFlow(room) }));

  if (designs.length) {
    wrap.appendChild(el('h2', { text: `Aménagements pour cette pièce (${designs.length})` }));
    for (const design of designs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))) {
      wrap.appendChild(
        el('a', { class: 'card', href: `#/designs/${design.id}`, style: { textDecoration: 'none', color: 'inherit', display: 'block' } }, [
          el('h3', { text: design.result?.titre || 'Aménagement' }),
          el('p', { class: 'small muted', text: formatDate(design.createdAt) }),
        ])
      );
    }
  }

  wrap.appendChild(
    el('div', { class: 'row row--end' }, [
      el('button', {
        class: 'button button--danger button--small',
        text: 'Supprimer la pièce',
        onclick: async () => {
          if (!(await confirmDialog(`Supprimer « ${room.nom} » ainsi que ses ${designs.length} aménagement(s) ?`))) return;
          for (const photoId of room.photoIds || []) await deletePhoto(photoId);
          for (const design of designs) await remove(STORES.designs, design.id);
          await remove(STORES.rooms, room.id);
          toast('Pièce supprimée.');
          location.hash = '#/pieces';
        },
      }),
    ])
  );

  return wrap;
}

export async function render({ params, query, action }) {
  return action === 'detail' ? detailView(params.id) : listView(query);
}
