import { el, clear, formatPrice, progress, productImage, toast } from '../lib/ui.js';
import { listStores, listCategories, searchCatalog, searchCatalogLive, storeLinks } from '../lib/api.js';
import { categoryLabel } from './furniture.js';

const PAR_PAGE = 24;
const FILTRE_MAGASINS = 'chez-moi:magasins-filtres';

const TRIS = [
  ['pertinence', 'Pertinence'],
  ['prix-croissant', 'Prix croissant'],
  ['prix-decroissant', 'Prix décroissant'],
  ['nom', 'Nom'],
];

function lireMagasins() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FILTRE_MAGASINS) || '[]'));
  } catch {
    return new Set();
  }
}

function ecrireMagasins(selection) {
  try {
    localStorage.setItem(FILTRE_MAGASINS, JSON.stringify([...selection]));
  } catch {
    /* le filtre reste valable pour la session */
  }
}

function carteProduit(produit) {
  return el(
    'a',
    {
      class: 'produit',
      href: produit.url || '#',
      target: '_blank',
      rel: 'noopener noreferrer',
      title: produit.title,
    },
    [
      el('div', { class: 'produit__image' }, [productImage(produit)]),
      el('div', { class: 'produit__corps' }, [
        el('div', { class: 'produit__titre clamp-2', text: produit.title }),
        el('div', { class: 'produit__pied' }, [
          el('span', { class: 'produit__magasin', text: produit.storeName }),
          el('span', { class: 'produit__tarif', text: formatPrice(produit.price, produit.currency) }),
        ]),
      ]),
    ]
  );
}

const squelettes = (n) =>
  Array.from({ length: n }, () => el('div', { class: 'skeleton', style: { aspectRatio: '3 / 4' } }));

export async function render({ query }) {
  const etat = {
    q: query.get('q') || '',
    category: query.get('category') || '',
    sort: 'pertinence',
    minPrice: '',
    maxPrice: '',
    magasins: lireMagasins(),
    offset: 0,
    total: 0,
  };

  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('h1', { text: 'Catalogue' }));

  /* ---------- recherche ---------- */
  const champ = el('input', { type: 'search', placeholder: 'tapis laine écru, lampadaire noir…', value: etat.q });
  const formulaire = el('form', { onsubmit: (evenement) => { evenement.preventDefault(); relancer(); } }, [
    el('div', { class: 'row' }, [
      el('div', { class: 'grow' }, [champ]),
      el('button', { class: 'button', type: 'submit', text: 'Chercher' }),
    ]),
  ]);
  wrap.appendChild(formulaire);

  /* ---------- filtres ---------- */
  const puces = el('div', { class: 'chips chips--defilantes' });
  const rayon = el('select', {}, [el('option', { value: '', text: 'Tous les rayons' })]);
  const tri = el('select', {}, TRIS.map(([valeur, libelle]) => el('option', { value: valeur, text: libelle })));
  const prixMin = el('input', { type: 'number', min: '0', step: '10', placeholder: 'min' });
  const prixMax = el('input', { type: 'number', min: '0', step: '10', placeholder: 'max' });

  rayon.addEventListener('change', () => { etat.category = rayon.value; relancer(); });
  tri.addEventListener('change', () => { etat.sort = tri.value; relancer(); });
  let minuterie = null;
  for (const champPrix of [prixMin, prixMax]) {
    champPrix.addEventListener('input', () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => {
        etat.minPrice = prixMin.value;
        etat.maxPrice = prixMax.value;
        relancer();
      }, 450);
    });
  }

  wrap.appendChild(puces);
  wrap.appendChild(
    el('div', { class: 'barre-filtres' }, [
      el('div', {}, [el('label', { text: 'Rayon' }), rayon]),
      el('div', {}, [el('label', { text: 'Trier par' }), tri]),
      el('div', {}, [el('label', { text: 'Prix minimum' }), prixMin]),
      el('div', {}, [el('label', { text: 'Prix maximum' }), prixMax]),
    ])
  );

  /* ---------- résultats ---------- */
  const compteur = el('p', { class: 'compteur' });
  const grille = el('div', { class: 'produits' });
  const pied = el('div', { class: 'center' });
  wrap.appendChild(compteur);
  wrap.appendChild(grille);
  wrap.appendChild(pied);

  const parametres = () => {
    const p = { limit: String(PAR_PAGE), offset: String(etat.offset), sort: etat.sort };
    if (etat.q) p.q = etat.q;
    if (etat.category) p.category = etat.category;
    if (etat.minPrice) p.minPrice = etat.minPrice;
    if (etat.maxPrice) p.maxPrice = etat.maxPrice;
    if (etat.magasins.size) p.store = [...etat.magasins].join(',');
    return p;
  };

  async function charger({ ajouter = false } = {}) {
    if (!ajouter) {
      clear(grille).append(...squelettes(6));
      compteur.textContent = 'Chargement…';
    }
    clear(pied);
    try {
      const donnees = await searchCatalog(parametres());
      etat.total = donnees.total;
      if (!ajouter) clear(grille);
      for (const produit of donnees.products) grille.appendChild(carteProduit(produit));

      if (!donnees.total) {
        compteur.textContent = '';
        clear(grille).appendChild(
          el('p', { class: 'empty', text: 'Aucun produit ne correspond à ces critères.' })
        );
        return;
      }

      const affiches = Math.min(etat.offset + donnees.products.length, donnees.total);
      compteur.textContent = `${affiches} produit${affiches > 1 ? 's' : ''} sur ${donnees.total.toLocaleString('fr-FR')}`;

      if (affiches < donnees.total) {
        const bouton = el('button', { class: 'button button--ghost', text: 'Charger plus' });
        bouton.addEventListener('click', () => {
          bouton.disabled = true;
          bouton.textContent = 'Chargement…';
          etat.offset += PAR_PAGE;
          charger({ ajouter: true });
        });
        pied.appendChild(bouton);
      }
      majRayons(donnees.categories);
    } catch (erreur) {
      clear(grille);
      compteur.textContent = '';
      pied.appendChild(el('p', { class: 'notice small', text: erreur.message }));
    }
  }

  function relancer() {
    etat.q = champ.value.trim();
    etat.offset = 0;
    charger();
  }

  /* ---------- rayons, alimentés par les facettes ---------- */
  let rayonsConnus = false;
  function majRayons(facettes) {
    if (rayonsConnus && !facettes?.length) return;
    const choix = rayon.value;
    clear(rayon);
    rayon.appendChild(el('option', { value: '', text: 'Tous les rayons' }));
    for (const facette of facettes || []) {
      rayon.appendChild(
        el('option', { value: facette.id, text: `${categoryLabel(facette.id)} (${facette.count})` })
      );
    }
    // La facette du rayon choisi disparait des resultats filtres : on la garde.
    if (choix && !rayon.querySelector(`option[value="${choix}"]`)) {
      rayon.appendChild(el('option', { value: choix, text: categoryLabel(choix) }));
    }
    rayon.value = choix;
    rayonsConnus = true;
  }

  listCategories()
    .then(({ categories }) => majRayons(categories))
    .catch(() => {});

  /* ---------- puces magasin ---------- */
  function construirePuces(connectes) {
    clear(puces);
    if (connectes.length < 2) return;
    const puce = (libelle, actif, auClic) =>
      el('button', {
        class: actif ? 'chip chip--accent' : 'chip',
        type: 'button',
        'aria-pressed': actif ? 'true' : 'false',
        style: { cursor: 'pointer', font: 'inherit', fontSize: '0.8rem' },
        text: libelle,
        onclick: auClic,
      });

    puces.appendChild(
      puce('Tous les magasins', etat.magasins.size === 0, () => {
        etat.magasins.clear();
        ecrireMagasins(etat.magasins);
        construirePuces(connectes);
        relancer();
      })
    );
    for (const magasin of connectes) {
      puces.appendChild(
        puce(magasin.name, etat.magasins.has(magasin.id), () => {
          if (etat.magasins.has(magasin.id)) etat.magasins.delete(magasin.id);
          else etat.magasins.add(magasin.id);
          ecrireMagasins(etat.magasins);
          construirePuces(connectes);
          relancer();
        })
      );
    }
  }

  /* ---------- recherche en ligne ---------- */
  const boutonEnLigne = el('button', {
    class: 'button button--soft button--block',
    text: 'Chercher sur les sites des magasins',
  });
  const zoneEnLigne = el('div', { class: 'stack' });
  boutonEnLigne.addEventListener('click', async () => {
    const terme = champ.value.trim();
    if (!terme) {
      toast('Saisissez d’abord ce que vous cherchez.');
      return;
    }
    boutonEnLigne.disabled = true;
    clear(zoneEnLigne).appendChild(progress('Recherche sur les sites des magasins…'));
    try {
      const parametresEnLigne = { q: terme };
      if (etat.magasins.size) parametresEnLigne.store = [...etat.magasins].join(',');
      const { live } = await searchCatalogLive(parametresEnLigne);
      clear(zoneEnLigne);
      zoneEnLigne.appendChild(el('h2', { text: 'Trouvés en ligne' }));
      if (live?.length) {
        const grilleEnLigne = el('div', { class: 'produits' }, live.map(carteProduit));
        zoneEnLigne.appendChild(grilleEnLigne);
      } else {
        zoneEnLigne.appendChild(el('p', { class: 'small muted', text: 'Rien trouvé sur les sites autorisés.' }));
      }
      const liens = await storeLinks(terme);
      zoneEnLigne.appendChild(
        el('div', { class: 'card card--flat' }, [
          el('h3', { text: 'Chercher directement sur les sites' }),
          el('div', { class: 'chips' }, liens.links.map((lien) =>
            el('a', { class: 'chip chip--accent', href: lien.url, target: '_blank', rel: 'noopener noreferrer', text: lien.name })
          )),
        ])
      );
    } catch (erreur) {
      clear(zoneEnLigne).appendChild(el('p', { class: 'notice small', text: erreur.message }));
    } finally {
      boutonEnLigne.disabled = false;
    }
  });
  wrap.appendChild(el('hr', { class: 'sep' }));
  wrap.appendChild(boutonEnLigne);
  wrap.appendChild(zoneEnLigne);

  /* ---------- état des catalogues ---------- */
  const carteEtat = el('div', { class: 'card card--flat' }, [progress('Chargement des magasins…')]);
  wrap.appendChild(carteEtat);

  listStores()
    .then((statut) => {
      const connectes = statut.stores.filter((magasin) => magasin.hasRealFeed);
      for (const id of [...etat.magasins]) {
        if (!connectes.some((magasin) => magasin.id === id)) etat.magasins.delete(id);
      }
      construirePuces(connectes);

      clear(carteEtat).append(
        el('h3', { text: 'Catalogues connectés' }),
        el('div', { class: 'stack' }, statut.stores.map((magasin) =>
          el('div', {}, [
            el('div', { class: 'row' }, [
              el('div', { class: 'grow' }, [
                el('div', { style: { fontWeight: '600' }, text: magasin.name }),
                el('div', {
                  class: 'small muted',
                  text: magasin.hasRealFeed
                    ? `${magasin.productCount} produits importés`
                    : magasin.feedConfigured
                      ? 'flux configuré, pas encore synchronisé'
                      : 'pas de catalogue connecté',
                }),
              ]),
              el('span', {
                class: magasin.hasRealFeed ? 'chip chip--sage' : 'chip',
                text: magasin.hasRealFeed ? 'connecté' : 'non connecté',
              }),
            ]),
            !magasin.hasRealFeed && magasin.note
              ? el('div', { class: 'small muted', style: { marginTop: '2px', opacity: '0.85' }, text: magasin.note })
              : null,
          ])
        ))
      );
    })
    .catch(() => {
      clear(carteEtat).appendChild(
        el('p', { class: 'small muted', text: 'Serveur injoignable : le catalogue nécessite une connexion.' })
      );
    });

  charger();
  return wrap;
}
