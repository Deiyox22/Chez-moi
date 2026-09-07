import { el, emptyState, remplir } from '../lib/ui.js';
import { all, STORES } from '../lib/db.js';
import { health } from '../lib/api.js';

function tile(count, label, href) {
  return el('a', { class: 'card card--flat', href, style: { textDecoration: 'none', color: 'inherit' } }, [
    el('div', { style: { fontSize: '1.9rem', fontWeight: '700', lineHeight: '1.1' }, text: String(count) }),
    el('div', { class: 'small muted', text: label }),
  ]);
}

export async function render() {
  const [furniture, rooms, designs] = await Promise.all([
    all(STORES.furniture),
    all(STORES.rooms),
    all(STORES.designs),
  ]);

  const wrap = el('div', { class: 'stack' });

  wrap.appendChild(
    el('div', {}, [
      el('h1', { text: 'Votre intérieur, à partir de vos meubles' }),
      el('p', {
        class: 'muted',
        text: "Photographiez ce que vous possédez, envoyez les photos d'une pièce, et recevez un aménagement qui part de votre mobilier plutôt que d'une page blanche.",
      }),
    ])
  );

  wrap.appendChild(
    el('div', { class: 'grid' }, [
      tile((furniture || []).length, 'meubles inventoriés', '#/meubles'),
      tile((rooms || []).length, 'pièces enregistrées', '#/pieces'),
      tile((designs || []).length, 'aménagements générés', '#/designs'),
    ])
  );

  const nextStep = !(furniture || []).length
    ? { label: '1. Inventoriez vos meubles', href: '#/meubles?ajouter=1', hint: 'Une photo suffit pour démarrer. Ajoutez-en d\'autres au fil de l\'eau.' }
    : !(rooms || []).length
      ? { label: '2. Ajoutez une pièce', href: '#/pieces?ajouter=1', hint: 'Photographiez la pièce depuis deux ou trois angles, et nommez-la si vous voulez.' }
      : { label: '3. Générez un aménagement', href: '#/pieces', hint: 'Ouvrez une pièce et lancez une proposition d\'aménagement.' };

  wrap.appendChild(
    el('div', { class: 'card' }, [
      el('h2', { text: 'Prochaine étape' }),
      el('p', { class: 'small muted', text: nextStep.hint }),
      el('a', { class: 'button button--block', href: nextStep.href, text: nextStep.label }),
    ])
  );

  if (!(furniture || []).length && !(rooms || []).length) {
    wrap.appendChild(
      el('div', { class: 'card card--flat' }, [
        el('h2', { text: 'Comment ça marche' }),
        el('ol', { class: 'steps' }, [
          el('li', { html: '<strong>Vos meubles.</strong> Prenez-les en photo un par un. L\'app identifie le type, le style, les matières, les couleurs et estime les dimensions.' }),
          el('li', { html: '<strong>Vos pièces.</strong> Envoyez les photos d\'une pièce, avec un nom si vous voulez (chambre, salon, bureau…). Le nom est facultatif.' }),
          el('li', { html: '<strong>L\'aménagement.</strong> Vous recevez un plan, une palette, le rôle de chaque meuble que vous possédez déjà, et seulement ce qui manque vraiment.' }),
          el('li', { html: '<strong>Les magasins.</strong> Ce qui manque est cherché dans les catalogues configurés, avec le prix et le lien.' }),
        ]),
      ])
    );
  }

  const statusCard = el('div', { class: 'card card--flat' }, [el('p', { class: 'small muted', text: 'Vérification du serveur…' })]);
  wrap.appendChild(statusCard);

  health()
    .then((status) => {
      remplir(statusCard, 
        el('h3', { text: 'État du service' }),
        el('div', { class: 'chips' }, [
          el('span', { class: status.ia === 'configuree' ? 'chip chip--sage' : 'chip', text: status.ia === 'configuree' ? `IA : ${status.modele}` : 'IA : non configurée' }),
          el('span', { class: 'chip', text: `${status.catalogue.produits} produits au catalogue` }),
        ]),
        status.ia === 'configuree'
          ? null
          : el('p', {
              class: 'notice small',
              style: { marginTop: '10px' },
              text: "Ajoutez ANTHROPIC_API_KEY dans le fichier .env du serveur pour activer l'analyse des photos et la génération d'aménagements.",
            })
      );
    })
    .catch(() => {
      remplir(statusCard, 
        el('p', { class: 'small muted', text: "Serveur injoignable. Vos données locales restent consultables hors ligne." })
      );
    });

  wrap.appendChild(
    el('div', { class: 'row row--end' }, [el('a', { class: 'button button--ghost button--small', href: '#/reglages', text: 'Réglages et données' })])
  );

  void emptyState;
  return wrap;
}
