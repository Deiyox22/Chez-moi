import { el, clear, formatPrice, progress, productImage, toast, uid } from '../lib/ui.js';
import { listStores, listCategories, catalogHighlights, searchCatalog, searchCatalogLive, storeLinks } from '../lib/api.js';
import { categoryLabel } from './furniture.js';
import { STORES, put, all } from '../lib/db.js';
import { lireDimensions } from '../lib/dimensions.js';

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

/** Identifiants catalogue deja presents dans la liste d'achats. */
const dejaAjoutes = new Set();

async function chargerDejaAjoutes() {
  const meubles = (await all(STORES.furniture)) || [];
  dejaAjoutes.clear();
  for (const meuble of meubles) {
    if (meuble.produitId) dejaAjoutes.add(meuble.produitId);
  }
}

async function ajouterAuxAchats(produit, bouton) {
  if (dejaAjoutes.has(produit.id)) return;
  await put(STORES.furniture, {
    id: uid('meuble'),
    createdAt: new Date().toISOString(),
    statut: 'a_acheter',
    source: 'catalogue',
    produitId: produit.id,
    photoIds: [],
    nom: produit.title,
    categorie: produit.category || 'autre',
    styles: produit.styles || [],
    couleurs: (produit.colors || []).map((nom) => ({ name: nom, hex: '#cccccc' })),
    materiaux: produit.materials || [],
    dimensionsEstimeesCm: lireDimensions(produit.title, produit.dimensionsText, produit.description),
    etat: 'neuf',
    particularites: [],
    atouts: '',
    confiance: 1,
    boutique: {
      magasin: produit.store,
      magasinNom: produit.storeName,
      prix: produit.price,
      devise: produit.currency,
      url: produit.url,
      imageUrl: produit.imageUrl,
    },
  });
  dejaAjoutes.add(produit.id);
  bouton.classList.add('produit__ajout--ajoute');
  bouton.textContent = '✓';
  bouton.title = 'Déjà dans votre liste d’achats';
  toast(`« ${produit.title.slice(0, 40)} » ajouté à votre liste d’achats.`);
}

function carteProduit(produit) {
  const ajoute = dejaAjoutes.has(produit.id);
  const bouton = el('button', {
    class: ajoute ? 'produit__ajout produit__ajout--ajoute' : 'produit__ajout',
    type: 'button',
    title: ajoute ? 'Déjà dans votre liste d’achats' : 'Ajouter à ma liste d’achats',
    'aria-label': ajoute ? 'Déjà dans votre liste d’achats' : `Ajouter ${produit.title} à ma liste d’achats`,
    text: ajoute ? '✓' : '+',
  });
  bouton.addEventListener('click', (evenement) => {
    evenement.preventDefault();
    evenement.stopPropagation();
    ajouterAuxAchats(produit, bouton).catch((erreur) => toast(erreur.message, 'error'));
  });

  return el('div', { class: 'produit-carte' }, [
    el(
      'a',
      { class: 'produit', href: produit.url || '#', target: '_blank', rel: 'noopener noreferrer', title: produit.title },
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
    ),
    bouton,
  ]);
}

const squelettes = (n) =>
  Array.from({ length: n }, () => el('div', { class: 'skeleton', style: { aspectRatio: '3 / 4' } }));

function enTeteSection(titre, actionLibelle, action) {
  return el('div', { class: 'section-titre' }, [
    el('h2', { text: titre }),
    action ? el('button', { type: 'button', text: actionLibelle, onclick: action }) : null,
  ]);
}

export async function render({ query }) {
  const etat = {
    q: query.get('q') || '',
    category: query.get('category') || '',
    categories: [],
    sort: 'pertinence',
    minPrice: '',
    maxPrice: '',
    magasins: lireMagasins(),
    offset: 0,
    total: 0,
    chargement: false,
    fini: false,
  };

  const filtreActif = () =>
    Boolean(etat.q || etat.category || etat.categories.length || etat.minPrice || etat.maxPrice || etat.magasins.size);

  const nombreFiltres = () =>
    [etat.category || etat.categories.length, etat.minPrice, etat.maxPrice, etat.magasins.size].filter(Boolean).length;

  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('h1', { text: 'Catalogue', style: { marginBottom: '2px' } }));
  const sousTitre = el('p', { class: 'small muted', style: { margin: '0 0 4px' }, text: '' });
  wrap.appendChild(sousTitre);

  /* ---------- recherche ---------- */
  const champ = el('input', { type: 'search', placeholder: 'canapé velours, tapis écru, lampadaire…', value: etat.q });
  wrap.appendChild(
    el('form', { onsubmit: (evenement) => { evenement.preventDefault(); relancer(); } }, [
      el('div', { class: 'row' }, [
        el('div', { class: 'grow' }, [champ]),
        el('button', { class: 'button', type: 'submit', text: 'Chercher' }),
      ]),
    ])
  );

  /* ---------- magasins ---------- */
  const puces = el('div', { class: 'chips chips--defilantes' });
  wrap.appendChild(puces);

  /* ---------- filtres repliables ---------- */
  const compteFiltres = el('span', { class: 'filtres-bascule__compte', hidden: true });
  const bascule = el('button', { class: 'filtres-bascule', type: 'button', 'aria-expanded': 'false' }, [
    el('span', { text: 'Filtrer et trier' }),
    compteFiltres,
  ]);
  const rayon = el('select', {}, [el('option', { value: '', text: 'Tous les rayons' })]);
  const tri = el('select', {}, TRIS.map(([valeur, libelle]) => el('option', { value: valeur, text: libelle })));
  const prixMin = el('input', { type: 'number', min: '0', step: '10', placeholder: 'min' });
  const prixMax = el('input', { type: 'number', min: '0', step: '10', placeholder: 'max' });
  const boutonEffacer = el('button', {
    class: 'button button--ghost button--small',
    type: 'button',
    text: 'Tout effacer',
    onclick: () => {
      etat.q = '';
      etat.category = '';
      etat.categories = [];
      etat.minPrice = '';
      etat.maxPrice = '';
      etat.magasins.clear();
      ecrireMagasins(etat.magasins);
      champ.value = '';
      rayon.value = '';
      prixMin.value = '';
      prixMax.value = '';
      tri.value = 'pertinence';
      etat.sort = 'pertinence';
      construirePuces(magasinsConnectes);
      relancer();
    },
  });

  const panneau = el('div', { class: 'stack', hidden: true }, [
    el('div', { class: 'barre-filtres' }, [
      el('div', {}, [el('label', { text: 'Rayon' }), rayon]),
      el('div', {}, [el('label', { text: 'Trier par' }), tri]),
      el('div', {}, [el('label', { text: 'Prix minimum' }), prixMin]),
      el('div', {}, [el('label', { text: 'Prix maximum' }), prixMax]),
    ]),
    el('div', { class: 'row row--end' }, [boutonEffacer]),
  ]);

  bascule.addEventListener('click', () => {
    const ouvert = panneau.hidden;
    panneau.hidden = !ouvert;
    bascule.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  });

  rayon.addEventListener('change', () => { etat.category = rayon.value; etat.categories = []; relancer(); });
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

  wrap.appendChild(el('div', { class: 'row' }, [bascule]));
  wrap.appendChild(panneau);

  /* ---------- zones ---------- */
  const vitrine = el('div');
  const enTeteResultats = el('div');
  const compteur = el('p', { class: 'compteur' });
  const grille = el('div', { class: 'produits' });
  const sentinelle = el('div', { class: 'sentinelle' });
  const pied = el('div', { class: 'center' });
  wrap.append(vitrine, enTeteResultats, compteur, grille, sentinelle, pied);

  /* ---------- chargement des résultats ---------- */
  const parametres = () => {
    const p = { limit: String(PAR_PAGE), offset: String(etat.offset), sort: etat.sort };
    if (etat.q) p.q = etat.q;
    if (etat.category) p.category = etat.category;
    if (etat.categories.length) p.categories = etat.categories.join(',');
    if (etat.minPrice) p.minPrice = etat.minPrice;
    if (etat.maxPrice) p.maxPrice = etat.maxPrice;
    if (etat.magasins.size) p.store = [...etat.magasins].join(',');
    return p;
  };

  async function charger({ suite = false } = {}) {
    if (etat.chargement || (suite && etat.fini)) return;
    etat.chargement = true;
    if (!suite) {
      clear(grille).append(...squelettes(6));
      compteur.textContent = 'Chargement…';
      clear(pied);
    }
    try {
      const donnees = await searchCatalog(parametres());
      etat.total = donnees.total;
      if (!suite) clear(grille);
      for (const produit of donnees.products) grille.appendChild(carteProduit(produit));

      const affiches = grille.querySelectorAll('.produit').length;
      etat.fini = affiches >= donnees.total || donnees.products.length === 0;

      if (!donnees.total) {
        compteur.textContent = '';
        clear(grille).appendChild(
          el('div', { class: 'empty' }, [
            el('span', { class: 'empty__mark', 'aria-hidden': 'true', text: '∅' }),
            el('p', { text: 'Aucun produit ne correspond à ces critères.' }),
            el('button', { class: 'button button--soft', text: 'Effacer les filtres', onclick: () => boutonEffacer.click() }),
          ])
        );
        return;
      }

      compteur.textContent = `${affiches} produit${affiches > 1 ? 's' : ''} sur ${donnees.total.toLocaleString('fr-FR')}`;
      majRayons(donnees.categories);
      clear(pied);
      if (etat.fini && affiches > PAR_PAGE) pied.appendChild(el('p', { class: 'small muted', text: 'Fin du catalogue.' }));
      // Un observateur ne se declenche qu'au changement d'etat : si la sentinelle
      // est restee visible pendant le chargement, il faut la lui represente.
      relancerObservation();
    } catch (erreur) {
      clear(grille);
      compteur.textContent = '';
      clear(pied).appendChild(el('p', { class: 'notice small', text: erreur.message }));
      etat.fini = true;
    } finally {
      etat.chargement = false;
    }
  }

  function relancer() {
    etat.q = champ.value.trim();
    etat.offset = 0;
    etat.fini = false;
    compteFiltres.textContent = String(nombreFiltres());
    compteFiltres.hidden = nombreFiltres() === 0;
    majVitrine();
    charger();
  }

  /* ---------- défilement infini ---------- */
  const observateur =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entrees) => {
            if (entrees.some((entree) => entree.isIntersecting) && !etat.chargement && !etat.fini) {
              etat.offset += PAR_PAGE;
              charger({ suite: true });
            }
          },
          { rootMargin: '600px 0px' }
        )
      : null;

  function relancerObservation() {
    if (!observateur) return;
    observateur.unobserve(sentinelle);
    if (!etat.fini) observateur.observe(sentinelle);
  }

  if (observateur) observateur.observe(sentinelle);
  else {
    // Sans observateur, un bouton fait le meme travail.
    pied.appendChild(
      el('button', {
        class: 'button button--ghost',
        text: 'Charger plus',
        onclick: () => { etat.offset += PAR_PAGE; charger({ suite: true }); },
      })
    );
  }

  // Un defilement rapide peut franchir la sentinelle entre deux images sans
  // qu'elle soit jamais observee intersectante. Une verification de proximite
  // du bas rattrape ce cas.
  let planifie = false;
  function auDefilement() {
    // La vue a ete remplacee par le routeur : on se retire.
    if (!sentinelle.isConnected) {
      window.removeEventListener('scroll', auDefilement);
      observateur?.disconnect();
      return;
    }
    if (planifie || etat.chargement || etat.fini) return;
    planifie = true;
    requestAnimationFrame(() => {
      planifie = false;
      const restant = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      if (restant < 900 && !etat.chargement && !etat.fini) {
        etat.offset += PAR_PAGE;
        charger({ suite: true });
      }
    });
  }
  window.addEventListener('scroll', auDefilement, { passive: true });

  /* ---------- rayons du sélecteur ---------- */
  let rayonsConnus = false;
  function majRayons(facettes) {
    if (rayonsConnus && !facettes?.length) return;
    const choix = rayon.value;
    clear(rayon);
    rayon.appendChild(el('option', { value: '', text: 'Tous les rayons' }));
    for (const facette of facettes || []) {
      rayon.appendChild(el('option', { value: facette.id, text: `${categoryLabel(facette.id)} (${facette.count})` }));
    }
    if (choix && !rayon.querySelector(`option[value="${choix}"]`)) {
      rayon.appendChild(el('option', { value: choix, text: categoryLabel(choix) }));
    }
    rayon.value = choix;
    rayonsConnus = true;
  }
  listCategories().then(({ categories }) => majRayons(categories)).catch(() => {});

  /* ---------- vitrine d'accueil ---------- */
  let vitrineChargee = null;

  function ouvrirRayon(id) {
    etat.category = id;
    etat.categories = [];
    rayon.value = id;
    champ.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    relancer();
  }

  function ouvrirSelection(selection) {
    etat.category = '';
    etat.categories = selection.categories;
    etat.maxPrice = selection.maxPrice ? String(selection.maxPrice) : '';
    prixMax.value = etat.maxPrice;
    rayon.value = '';
    champ.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    relancer();
  }

  function dessinerVitrine(donnees) {
    clear(vitrine);
    vitrine.appendChild(enTeteSection('Rayons'));
    vitrine.appendChild(
      el('div', { class: 'rangee' }, donnees.rayons.map((rayonDonnee) =>
        el('button', { class: 'tuile-rayon', type: 'button', onclick: () => ouvrirRayon(rayonDonnee.id) }, [
          el('div', { class: 'tuile-rayon__image' }, [productImage({ imageUrl: rayonDonnee.imageUrl })]),
          el('span', { class: 'tuile-rayon__nom', text: categoryLabel(rayonDonnee.id) }),
          el('span', { class: 'tuile-rayon__compte', text: `${rayonDonnee.count}` }),
        ])
      ))
    );

    for (const selection of donnees.selections) {
      vitrine.appendChild(enTeteSection(selection.titre, 'Voir tout', () => ouvrirSelection(selection)));
      vitrine.appendChild(el('div', { class: 'rangee' }, selection.produits.map(carteProduit)));
    }
    vitrine.appendChild(enTeteSection('Tout le catalogue'));
  }

  function majVitrine() {
    const surAccueil = !filtreActif();
    vitrine.hidden = !surAccueil;
    clear(enTeteResultats);
    if (!surAccueil) enTeteResultats.appendChild(enTeteSection('Résultats'));
    if (surAccueil && !vitrineChargee) {
      vitrineChargee = catalogHighlights()
        .then((donnees) => dessinerVitrine(donnees))
        .catch(() => { vitrine.hidden = true; });
    }
  }

  /* ---------- puces magasin ---------- */
  let magasinsConnectes = [];
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
      zoneEnLigne.appendChild(enTeteSection('Trouvés en ligne'));
      zoneEnLigne.appendChild(
        live?.length
          ? el('div', { class: 'produits' }, live.map(carteProduit))
          : el('p', { class: 'small muted', text: 'Rien trouvé sur les sites autorisés.' })
      );
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
      magasinsConnectes = statut.stores.filter((magasin) => magasin.hasRealFeed);
      for (const id of [...etat.magasins]) {
        if (!magasinsConnectes.some((magasin) => magasin.id === id)) etat.magasins.delete(id);
      }
      construirePuces(magasinsConnectes);
      sousTitre.textContent = `${statut.totalProducts.toLocaleString('fr-FR')} produits chez ${magasinsConnectes.length} enseignes`;

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

  if (etat.category) rayon.value = etat.category;
  await chargerDejaAjoutes();
  majVitrine();
  charger();
  return wrap;
}
