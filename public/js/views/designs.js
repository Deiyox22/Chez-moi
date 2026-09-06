import { el, toast, confirmDialog, emptyState, formatDate, formatPrice } from '../lib/ui.js';
import { STORES, get, remove, all, allSorted } from '../lib/db.js';
import { renderPlan, planLegend } from '../lib/plan.js';
import { buildMoodboard, downloadBlob } from '../lib/moodboard.js';

function productRow(product) {
  return el('a', { class: 'product', href: product.url || '#', target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit' } }, [
    el('div', { class: 'product__media' }, [
      product.imageUrl ? el('img', { src: product.imageUrl, alt: '', loading: 'lazy' }) : el('span', { text: '▤', 'aria-hidden': 'true' }),
    ]),
    el('div', { class: 'grow' }, [
      el('div', { style: { fontWeight: '600', fontSize: '0.94rem' }, text: product.title }),
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
