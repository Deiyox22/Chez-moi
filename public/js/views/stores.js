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

export async function render({ query }) {
  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('h1', { text: 'Magasins' }));

  const searchInput = el('input', { type: 'search', placeholder: 'tapis laine ecru, lampadaire noir…', value: query.get('q') || '' });
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
      const { live } = await searchCatalogLive({ q: term });
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
      const [{ products }, links] = await Promise.all([searchCatalog({ q: term, limit: 12 }), storeLinks(term)]);
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
  wrap.appendChild(resultsBox);
  wrap.appendChild(liveButton);
  wrap.appendChild(liveBox);
  wrap.appendChild(linksBox);

  const statusCard = el('div', { class: 'card card--flat' }, [progress('Chargement des magasins…')]);
  wrap.appendChild(statusCard);

  listStores()
    .then((status) => {
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
