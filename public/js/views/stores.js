import { el, formatPrice, progress, toast, productImage } from '../lib/ui.js';
import { listStores, searchCatalog, searchCatalogLive, storeLinks } from '../lib/api.js';

function productCard(product) {
  return el('a', { class: 'card item-card', href: product.url || '#', target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit' } }, [
    el('div', { class: 'item-card__thumb', style: { display: 'grid', placeItems: 'center', fontSize: '24px' } }, [
      productImage(product),
    ]),
    el('div', { class: 'grow' }, [
      el('h3', { class: 'clamp-2', text: product.title, style: { marginBottom: '4px', fontSize: '0.95rem' } }),
      el('div', { class: 'chips' }, [
        el('span', { class: 'chip chip--accent', text: product.storeName }),
        product.priceIsIndicative ? el('span', { class: 'chip', text: 'prix indicatif' }) : el('span', { class: 'chip chip--sage', text: 'catalogue réel' }),
      ]),
      product.description ? el('p', { class: 'small muted clamp-2', style: { margin: '6px 0 0' }, text: product.description }) : null,
    ]),
    el('div', { class: 'product__price', text: formatPrice(product.price, product.currency) }),
  ]);
}

const FILTER_KEY = 'chez-moi:magasins-filtres';

function readFilter() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FILTER_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function writeFilter(selection) {
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify([...selection]));
  } catch {
    /* le filtre reste valable pour la session */
  }
}

export async function render({ query }) {
  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('h1', { text: 'Magasins' }));

  const searchInput = el('input', { type: 'search', placeholder: 'tapis laine ecru, lampadaire noir…', value: query.get('q') || '' });
  const selection = readFilter();
  const filterBox = el('div', { class: 'chips', style: { marginTop: '4px' } });
  const resultsBox = el('div', { class: 'stack' });
  const liveBox = el('div', { class: 'stack' });
  const linksBox = el('div');

  const liveButton = el('button', {
    class: 'button button--soft button--block',
    text: 'Chercher sur les sites des magasins',
  });
  liveButton.addEventListener('click', async () => {
    const term = searchInput.value.trim();
    if (!term) return;
    liveButton.disabled = true;
    liveBox.replaceChildren(progress('Recherche en cours sur les sites des magasins…'));
    try {
      const liveParams = { q: term };
      if (selection.size) liveParams.store = [...selection].join(',');
      const { live } = await searchCatalogLive(liveParams);
      liveBox.replaceChildren(
        el('h2', { text: 'Trouvés en ligne' }),
        ...(live && live.length
          ? live.map(productCard)
          : [el('p', { class: 'small muted', text: 'Rien trouvé sur les sites autorisés pour cette recherche.' })])
      );
    } catch (error) {
      liveBox.replaceChildren(el('p', { class: 'notice small', text: error.message }));
    } finally {
      liveButton.disabled = false;
    }
  });

  const runSearch = async () => {
    const term = searchInput.value.trim();
    if (!term) return;
    resultsBox.replaceChildren(progress('Recherche dans les catalogues…'));
    linksBox.replaceChildren();
    try {
      const params = { q: term, limit: '12' };
      if (selection.size) params.store = [...selection].join(',');
      const [{ products }, links] = await Promise.all([searchCatalog(params), storeLinks(term)]);
      resultsBox.replaceChildren();
      liveBox.replaceChildren();
      if (!products.length) {
        resultsBox.appendChild(el('p', { class: 'small muted', text: 'Aucun produit dans les catalogues chargés. Essayez les liens ci-dessous.' }));
      } else {
        products.forEach((product) => resultsBox.appendChild(productCard(product)));
      }
      linksBox.replaceChildren(
        el('div', { class: 'card card--flat' }, [
          el('h3', { text: 'Chercher directement sur les sites' }),
          el('div', { class: 'chips' }, links.links.map((link) =>
            el('a', { class: 'chip chip--accent', href: link.url, target: '_blank', rel: 'noopener noreferrer', text: link.name })
          )),
        ])
      );
    } catch (error) {
      resultsBox.replaceChildren(el('p', { class: 'notice small', text: error.message }));
    }
  };

  const form = el('form', { onsubmit: (event) => { event.preventDefault(); runSearch(); } }, [
    el('div', { class: 'row' }, [
      el('div', { class: 'grow' }, [searchInput]),
      el('button', { class: 'button', type: 'submit', text: 'Chercher' }),
    ]),
  ]);
  wrap.appendChild(form);
  wrap.appendChild(filterBox);
  wrap.appendChild(resultsBox);
  wrap.appendChild(liveButton);
  wrap.appendChild(liveBox);
  wrap.appendChild(linksBox);

  const statusCard = el('div', { class: 'card card--flat' }, [progress('Chargement des magasins…')]);
  wrap.appendChild(statusCard);

  const buildFilter = (connected) => {
    filterBox.replaceChildren();
    if (connected.length < 2) return;

    const chip = (label, active, onclick) =>
      el('button', {
        class: active ? 'chip chip--accent' : 'chip',
        type: 'button',
        'aria-pressed': active ? 'true' : 'false',
        style: { cursor: 'pointer', font: 'inherit', fontSize: '0.8rem' },
        text: label,
        onclick,
      });

    filterBox.appendChild(
      chip('Tous', selection.size === 0, () => {
        selection.clear();
        writeFilter(selection);
        buildFilter(connected);
        runSearch();
      })
    );
    for (const store of connected) {
      filterBox.appendChild(
        chip(`${store.name} (${store.productCount})`, selection.has(store.id), () => {
          if (selection.has(store.id)) selection.delete(store.id);
          else selection.add(store.id);
          writeFilter(selection);
          buildFilter(connected);
          runSearch();
        })
      );
    }
  };

  listStores()
    .then((status) => {
      const connected = status.stores.filter((store) => store.hasRealFeed);
      // Un magasin retire du catalogue ne doit pas rester dans un filtre enregistre.
      for (const id of [...selection]) {
        if (!connected.some((store) => store.id === id)) selection.delete(id);
      }
      buildFilter(connected);

      const usesSample = status.sources.some((source) => source.type === 'exemple');
      statusCard.replaceChildren(
        el('h3', { text: 'Catalogues connectés' }),
        el('div', { class: 'stack' }, status.stores.map((store) =>
          el('div', {}, [
            el('div', { class: 'row' }, [
              el('div', { class: 'grow' }, [
                el('div', { style: { fontWeight: '600' }, text: store.name }),
                el('div', {
                  class: 'small muted',
                  text: store.hasRealFeed
                    ? `${store.productCount} produits importés`
                    : store.feedConfigured
                      ? 'flux configuré, pas encore synchronisé'
                      : 'pas de catalogue connecté',
                }),
              ]),
              el('span', { class: store.hasRealFeed ? 'chip chip--sage' : 'chip', text: store.hasRealFeed ? 'connecté' : 'non connecté' }),
            ]),
            !store.hasRealFeed && store.note
              ? el('div', { class: 'small muted', style: { marginTop: '2px', opacity: '0.85' }, text: store.note })
              : null,
          ])
        )),
        usesSample
          ? el('p', {
              class: 'notice small',
              style: { marginTop: '12px' },
              html: "Pour brancher une enseigne supplémentaire, renseignez l'URL de son flux produit dans <code>config/stores.json</code>, puis lancez <code>npm run catalog:sync</code>.",
            })
          : null
      );
    })
    .catch(() => {
      statusCard.replaceChildren(el('p', { class: 'small muted', text: 'Serveur injoignable : la recherche catalogue nécessite une connexion.' }));
    });

  if (query.get('q')) setTimeout(runSearch, 50);
  void toast;
  return wrap;
}
