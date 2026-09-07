import { el, toast, openModal, confirmDialog, emptyState, progress, uid, formatDate, formatPrice, productImage } from '../lib/ui.js';
import { STORES, put, get, remove, allSorted, savePhoto, photoUrl, deletePhoto } from '../lib/db.js';
import { normalizeImage, pickImages, captureFromCamera, blobsToImagePayload } from '../lib/images.js';
import { analyzeFurniture } from '../lib/api.js';

const CATEGORIES = [
  'canape', 'fauteuil', 'chaise', 'pouf', 'table_basse', 'table_repas', 'bureau', 'meuble_tv',
  'bibliotheque', 'etagere', 'buffet', 'commode', 'armoire', 'rangement', 'lit', 'tete_de_lit',
  'chevet', 'matelas', 'miroir', 'tapis', 'rideaux', 'coussin', 'plaid', 'luminaire_plafond',
  'lampadaire', 'lampe_table', 'decoration_murale', 'plante', 'electromenager', 'autre',
];

const CATEGORY_LABELS = {
  canape: 'Canapé', fauteuil: 'Fauteuil', chaise: 'Chaise', pouf: 'Pouf', table_basse: 'Table basse',
  table_repas: 'Table à manger', bureau: 'Bureau', meuble_tv: 'Meuble TV', bibliotheque: 'Bibliothèque',
  etagere: 'Étagère', buffet: 'Buffet', commode: 'Commode', armoire: 'Armoire', rangement: 'Rangement',
  lit: 'Lit', tete_de_lit: 'Tête de lit', chevet: 'Chevet', matelas: 'Matelas', miroir: 'Miroir',
  tapis: 'Tapis', rideaux: 'Rideaux', coussin: 'Coussin', plaid: 'Plaid', luminaire_plafond: 'Plafonnier',
  lampadaire: 'Lampadaire', lampe_table: 'Lampe à poser', decoration_murale: 'Décoration murale',
  plante: 'Plante', electromenager: 'Électroménager', autre: 'Autre',
  decoration: 'Décoration', linge_de_lit: 'Linge de lit', linge_de_bain: 'Linge de bain',
  oreiller: 'Oreiller', peinture: 'Peinture', etagere_murale: 'Étagère murale',
};

export const categoryLabel = (key) => CATEGORY_LABELS[key] || key || 'Autre';

/** Les fiches d'avant la liste d'achats n'ont pas de statut : ce sont des meubles possedes. */
export const statutDe = (item) => item.statut || 'possede';

const emptyItem = () => ({
  nom: '', categorie: 'autre', styles: [], couleurs: [], materiaux: [],
  dimensionsEstimeesCm: { largeurCm: 0, profondeurCm: 0, hauteurCm: 0 },
  etat: 'bon', particularites: [], atouts: '', confiance: 1,
});

const splitList = (value) => String(value || '').split(',').map((part) => part.trim()).filter(Boolean);

/* ---------------- form ---------------- */

function itemForm(item) {
  const data = { ...emptyItem(), ...item };
  const dims = { ...emptyItem().dimensionsEstimeesCm, ...(data.dimensionsEstimeesCm || {}) };

  const nameInput = el('input', { type: 'text', value: data.nom, placeholder: 'Canapé 3 places en velours vert' });
  const categorySelect = el('select', {}, CATEGORIES.map((key) =>
    el('option', { value: key, selected: key === data.categorie ? true : null, text: categoryLabel(key) })
  ));
  const stylesInput = el('input', { type: 'text', value: (data.styles || []).join(', '), placeholder: 'scandinave, vintage' });
  const colorsInput = el('input', {
    type: 'text',
    value: (data.couleurs || []).map((color) => color.name || color.nom || '').filter(Boolean).join(', '),
    placeholder: 'vert sapin, chêne clair',
  });
  const materialsInput = el('input', { type: 'text', value: (data.materiaux || []).join(', '), placeholder: 'velours, bois' });
  const widthInput = el('input', { type: 'number', value: Math.round(dims.largeurCm) || '', min: '0' });
  const depthInput = el('input', { type: 'number', value: Math.round(dims.profondeurCm) || '', min: '0' });
  const heightInput = el('input', { type: 'number', value: Math.round(dims.hauteurCm) || '', min: '0' });
  const conditionSelect = el('select', {}, ['neuf', 'tres bon', 'bon', 'use', 'a renover'].map((value) =>
    el('option', { value, selected: value === data.etat ? true : null, text: value })
  ));
  const notesInput = el('textarea', { placeholder: "Ce que ce meuble apporte, ce qui vous plaît ou vous gêne…" });
  notesInput.value = data.atouts || '';

  const node = el('div', { class: 'stack' }, [
    el('div', { class: 'field' }, [el('label', { text: 'Nom' }), nameInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Catégorie' }), categorySelect]),
    el('div', { class: 'field' }, [el('label', { text: 'Styles (séparés par des virgules)' }), stylesInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Couleurs' }), colorsInput]),
    el('div', { class: 'field' }, [el('label', { text: 'Matières' }), materialsInput]),
    el('div', { class: 'field' }, [
      el('label', { text: 'Dimensions estimées (cm)' }),
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [el('span', { class: 'small muted', text: 'largeur' }), widthInput]),
        el('div', { class: 'grow' }, [el('span', { class: 'small muted', text: 'profondeur' }), depthInput]),
        el('div', { class: 'grow' }, [el('span', { class: 'small muted', text: 'hauteur' }), heightInput]),
      ]),
    ]),
    el('div', { class: 'field' }, [el('label', { text: 'État' }), conditionSelect]),
    el('div', { class: 'field' }, [el('label', { text: 'Notes' }), notesInput]),
  ]);

  const read = () => {
    const existingColors = data.couleurs || [];
    return {
      ...data,
      nom: nameInput.value.trim() || 'Meuble sans nom',
      categorie: categorySelect.value,
      styles: splitList(stylesInput.value),
      couleurs: splitList(colorsInput.value).map((name) => {
        const previous = existingColors.find((color) => (color.name || color.nom) === name);
        return { name, hex: previous?.hex || '#cccccc' };
      }),
      materiaux: splitList(materialsInput.value),
      dimensionsEstimeesCm: {
        largeurCm: Number(widthInput.value) || 0,
        profondeurCm: Number(depthInput.value) || 0,
        hauteurCm: Number(heightInput.value) || 0,
      },
      etat: conditionSelect.value,
      atouts: notesInput.value.trim(),
    };
  };

  return { node, read };
}

/* ---------------- photo picking ---------------- */

async function collectPhotos() {
  return new Promise((resolve) => {
    const close = openModal('Ajouter des photos', (dismiss) =>
      el('div', { class: 'stack' }, [
        el('p', { class: 'small muted', text: "Cadrez le meuble en entier, avec un repère d'échelle si possible (porte, plinthe)." }),
        el('button', {
          class: 'button button--block',
          text: 'Prendre une photo',
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

async function thumbGrid(photoIds, onRemove) {
  const grid = el('div', { class: 'photo-strip' });
  for (const photoId of photoIds) {
    const url = await photoUrl(photoId);
    grid.appendChild(
      el('div', { class: 'thumb' }, [
        url ? el('img', { src: url, alt: '' }) : null,
        onRemove
          ? el('button', { class: 'thumb__remove', 'aria-label': 'Retirer cette photo', text: '×', onclick: () => onRemove(photoId) })
          : null,
      ])
    );
  }
  return grid;
}

/* ---------------- add flow ---------------- */

async function startAddFlow(onDone) {
  const blobs = await collectPhotos();
  if (!blobs.length) return;

  const photoIds = [];
  for (const blob of blobs) photoIds.push(await savePhoto(blob));

  const hintInput = el('input', { type: 'text', placeholder: 'Optionnel : "le fauteuil du salon", "hérité de ma grand-mère"…' });
  const status = el('div');
  const results = el('div', { class: 'stack' });

  const close = openModal('Nouveau meuble', (dismiss) => {
    const analyseButton = el('button', { class: 'button button--block', text: 'Analyser la photo' });
    const manualButton = el('button', { class: 'button button--ghost button--block', text: 'Saisir à la main' });

    const saveItems = async (items) => {
      let saved = 0;
      for (const entry of items) {
        if (!entry.keep()) continue;
        const value = entry.form.read();
        await put(STORES.furniture, {
          id: uid('meuble'),
          createdAt: new Date().toISOString(),
          photoIds,
          source: entry.source,
          ...value,
        });
        saved += 1;
      }
      if (!saved) {
        for (const photoId of photoIds) await deletePhoto(photoId);
        toast('Aucun meuble enregistré.');
      } else {
        toast(`${saved} meuble${saved > 1 ? 's' : ''} ajouté${saved > 1 ? 's' : ''}.`);
      }
      dismiss();
      onDone();
    };

    const renderItems = (items, source) => {
      results.replaceChildren();
      const entries = items.map((item) => {
        const form = itemForm(item);
        const keepBox = el('input', { type: 'checkbox', checked: true });
        results.appendChild(
          el('div', { class: 'card' }, [
            el('label', { class: 'checkbox' }, [keepBox, el('span', { text: 'Ajouter ce meuble à mon inventaire' })]),
            item.confiance !== undefined && item.confiance < 0.6
              ? el('p', { class: 'notice small', text: 'Identification peu sûre : vérifiez les champs ci-dessous.' })
              : null,
            el('hr', { class: 'sep' }),
            form.node,
          ])
        );
        return { form, source, keep: () => keepBox.checked };
      });
      results.appendChild(
        el('button', { class: 'button button--block', text: 'Enregistrer', onclick: () => saveItems(entries) })
      );
    };

    analyseButton.addEventListener('click', async () => {
      analyseButton.disabled = true;
      manualButton.disabled = true;
      status.replaceChildren(progress('Analyse des photos en cours…'));
      try {
        const images = await blobsToImagePayload(blobs);
        const response = await analyzeFurniture({ images, hint: hintInput.value.trim() });
        status.replaceChildren();
        if (response.remarque) status.appendChild(el('p', { class: 'notice small', text: response.remarque }));
        if (!response.items?.length) {
          status.appendChild(el('p', { class: 'small muted', text: "Aucun meuble n'a été identifié. Vous pouvez le saisir à la main." }));
          manualButton.disabled = false;
          analyseButton.disabled = false;
          return;
        }
        analyseButton.remove();
        manualButton.remove();
        hintInput.closest('.field')?.remove();
        renderItems(response.items, 'ia');
      } catch (error) {
        status.replaceChildren(el('p', { class: 'notice small', text: error.message }));
        analyseButton.disabled = false;
        manualButton.disabled = false;
      }
    });

    manualButton.addEventListener('click', () => {
      analyseButton.remove();
      manualButton.remove();
      hintInput.closest('.field')?.remove();
      renderItems([emptyItem()], 'manuel');
    });

    const photoBox = el('div');
    thumbGrid(photoIds, null).then((grid) => photoBox.replaceChildren(grid));

    return el('div', { class: 'stack' }, [
      photoBox,
      el('div', { class: 'field' }, [el('label', { text: 'Précision (facultatif)' }), hintInput]),
      analyseButton,
      manualButton,
      status,
      results,
    ]);
  });
  void close;
}

/* ---------------- views ---------------- */

async function listView(query) {
  const items = await allSorted(STORES.furniture);
  const wrap = el('div', { class: 'stack' });

  const addButton = el('button', { class: 'button', text: '＋ Ajouter', onclick: () => startAddFlow(() => location.reload()) });

  wrap.appendChild(
    el('div', { class: 'page-head' }, [
      el('div', {}, [
        el('h1', { text: 'Mes meubles' }),
        el('p', { class: 'small muted', text: `${items.length} élément${items.length > 1 ? 's' : ''} dans votre inventaire` }),
      ]),
      addButton,
    ])
  );

  const possedes = items.filter((item) => statutDe(item) === 'possede');
  const aAcheter = items.filter((item) => statutDe(item) === 'a_acheter');

  const carte = async (item) => {
    const url = item.photoIds?.[0] ? await photoUrl(item.photoIds[0]) : null;
    const vignette = url
      ? el('img', { src: url, alt: '' })
      : item.boutique?.imageUrl
        ? productImage({ imageUrl: item.boutique.imageUrl })
        : null;
    return el('a', { class: 'card item-card', href: `#/meubles/${item.id}`, style: { textDecoration: 'none', color: 'inherit' } }, [
      el('div', { class: 'item-card__thumb' }, [vignette]),
      el('div', { class: 'grow' }, [
        el('h3', { class: 'clamp-2', text: item.nom, style: { marginBottom: '4px' } }),
        el('div', { class: 'chips' }, [
          el('span', { class: 'chip chip--accent', text: categoryLabel(item.categorie) }),
          item.boutique?.magasinNom ? el('span', { class: 'chip', text: item.boutique.magasinNom }) : null,
          item.boutique?.prix ? el('span', { class: 'chip', text: formatPrice(item.boutique.prix, item.boutique.devise) }) : null,
        ]),
      ]),
    ]);
  };

  if (!items.length) {
    wrap.appendChild(
      emptyState(
        '▣',
        'Aucun meuble pour le moment',
        "Photographiez vos meubles un par un. C'est cet inventaire qui sert de base à tous les aménagements proposés.",
        el('button', { class: 'button', style: { marginTop: '12px' }, text: 'Photographier un meuble', onclick: () => startAddFlow(() => location.reload()) })
      )
    );
  } else {
    if (possedes.length) {
      wrap.appendChild(el('h2', { text: `Ce que je possède (${possedes.length})`, style: { marginTop: '10px' } }));
      for (const item of possedes) wrap.appendChild(await carte(item));
    }
    if (aAcheter.length) {
      wrap.appendChild(el('h2', { text: `Envies d'achat (${aAcheter.length})`, style: { marginTop: '18px' } }));
      wrap.appendChild(
        el('p', { class: 'small muted', style: { marginTop: '-6px' }, text: "Repérés dans le catalogue. Les aménagements les placeront comme des meubles à acquérir, sans en suggérer d'autres à leur place." })
      );
      for (const item of aAcheter) wrap.appendChild(await carte(item));
    }
  }

  if (query.get('ajouter') === '1') setTimeout(() => startAddFlow(() => location.reload()), 60);
  return wrap;
}

async function detailView(id) {
  const item = await get(STORES.furniture, id);
  if (!item) return emptyState('∅', 'Meuble introuvable', 'Il a peut-être été supprimé.', el('a', { class: 'button', href: '#/meubles', text: 'Retour à la liste' }));

  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('a', { class: 'small muted', href: '#/meubles', text: '← Mes meubles' }));
  wrap.appendChild(el('h1', { text: item.nom }));
  const origine = { ia: 'identifié par analyse photo', catalogue: 'repéré dans le catalogue' }[item.source] || 'saisi à la main';
  wrap.appendChild(
    el('div', { class: 'chips' }, [
      el('span', { class: 'chip chip--accent', text: categoryLabel(item.categorie) }),
      statutDe(item) === 'a_acheter' ? el('span', { class: 'chip chip--sage', text: 'envie d’achat' }) : null,
      el('span', { class: 'chip', text: `état : ${item.etat}` }),
      el('span', { class: 'chip', text: origine }),
    ])
  );

  if (item.boutique) {
    wrap.appendChild(
      el('div', { class: 'card' }, [
        el('div', { class: 'item-card' }, [
          el('div', { class: 'item-card__thumb' }, [productImage({ imageUrl: item.boutique.imageUrl })]),
          el('div', { class: 'grow' }, [
            el('h3', { text: item.boutique.magasinNom || 'Boutique', style: { marginBottom: '2px' } }),
            el('div', { class: 'produit__tarif', text: formatPrice(item.boutique.prix, item.boutique.devise) }),
            item.boutique.url
              ? el('a', {
                  class: 'small',
                  href: item.boutique.url,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  text: 'Voir la fiche produit',
                })
              : null,
          ]),
        ]),
        statutDe(item) === 'a_acheter'
          ? el('button', {
              class: 'button button--soft button--block',
              style: { marginTop: '12px' },
              text: 'Je l’ai acheté',
              onclick: async () => {
                await put(STORES.furniture, { ...item, statut: 'possede' });
                toast('Déplacé dans les meubles que vous possédez.');
                location.reload();
              },
            })
          : null,
      ])
    );
  }

  wrap.appendChild(await thumbGrid(item.photoIds || [], null));

  const dims = item.dimensionsEstimeesCm || {};
  wrap.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Caractéristiques' }),
      el('p', { class: 'small', html: `<strong>Dimensions estimées</strong> ${Math.round(dims.largeurCm || 0)} × ${Math.round(dims.profondeurCm || 0)} × ${Math.round(dims.hauteurCm || 0)} cm` }),
      (item.materiaux || []).length ? el('p', { class: 'small', html: `<strong>Matières</strong> ${item.materiaux.join(', ')}` }) : null,
      (item.styles || []).length ? el('p', { class: 'small', html: `<strong>Styles</strong> ${item.styles.join(', ')}` }) : null,
      (item.couleurs || []).length
        ? el('div', { class: 'swatches', style: { marginTop: '10px' } }, item.couleurs.map((color) =>
            el('div', { class: 'swatch' }, [
              el('div', { class: 'swatch__dot', style: { background: color.hex || '#ccc' } }),
              el('span', { text: color.name || color.nom || '' }),
            ])
          ))
        : null,
      item.atouts ? el('p', { class: 'small muted', style: { marginTop: '10px' }, text: item.atouts }) : null,
      el('p', { class: 'small muted', text: `Ajouté le ${formatDate(item.createdAt)}` }),
    ])
  );

  wrap.appendChild(
    el('div', { class: 'row' }, [
      el('button', {
        class: 'button button--soft grow',
        text: 'Modifier',
        onclick: () => {
          const close = openModal('Modifier le meuble', (dismiss) => {
            const form = itemForm(item);
            return el('div', { class: 'stack' }, [
              form.node,
              el('button', {
                class: 'button button--block',
                text: 'Enregistrer',
                onclick: async () => {
                  await put(STORES.furniture, { ...item, ...form.read() });
                  dismiss();
                  toast('Meuble mis à jour.');
                  location.hash = `#/meubles/${item.id}`;
                  location.reload();
                },
              }),
            ]);
          });
          void close;
        },
      }),
      el('button', {
        class: 'button button--danger',
        text: 'Supprimer',
        onclick: async () => {
          if (!(await confirmDialog(`Supprimer « ${item.nom} » ? Les photos associées seront effacées.`))) return;
          for (const photoId of item.photoIds || []) await deletePhoto(photoId);
          await remove(STORES.furniture, item.id);
          toast('Meuble supprimé.');
          location.hash = '#/meubles';
        },
      }),
    ])
  );

  return wrap;
}

export async function render({ params, query, action }) {
  return action === 'detail' ? detailView(params.id) : listView(query);
}
