import { el, toast, confirmDialog, formatDate } from '../lib/ui.js';
import { storageEstimate, pruneOrphanPhotos, exportAll, wipeEverything, all, STORES } from '../lib/db.js';
import { downloadBlob } from '../lib/moodboard.js';

function formatBytes(bytes) {
  if (!bytes) return '0 Mo';
  const units = ['o', 'ko', 'Mo', 'Go'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export async function render() {
  const wrap = el('div', { class: 'stack' });
  wrap.appendChild(el('a', { class: 'small muted', href: '#/', text: '← Accueil' }));
  wrap.appendChild(el('h1', { text: 'Réglages et données' }));

  const [furniture, rooms, designs, estimate] = await Promise.all([
    all(STORES.furniture),
    all(STORES.rooms),
    all(STORES.designs),
    storageEstimate(),
  ]);

  wrap.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Vos données' }),
      el('p', {
        class: 'small muted',
        text: "Vos photos, vos meubles et vos aménagements restent sur cet appareil, dans le stockage du navigateur. Les photos ne sont envoyées au serveur que le temps d'une analyse, et ne sont pas conservées côté serveur.",
      }),
      el('ul', { class: 'small' }, [
        el('li', { text: `${(furniture || []).length} meuble(s)` }),
        el('li', { text: `${(rooms || []).length} pièce(s)` }),
        el('li', { text: `${(designs || []).length} aménagement(s)` }),
        estimate ? el('li', { text: `${formatBytes(estimate.usage)} utilisés sur ${formatBytes(estimate.quota)} disponibles` }) : null,
      ]),
    ])
  );

  wrap.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Sauvegarde' }),
      el('p', { class: 'small muted', text: "L'export contient vos fiches meubles, pièces et aménagements au format JSON. Les photos ne sont pas incluses." }),
      el('button', {
        class: 'button button--soft button--block',
        text: 'Exporter en JSON',
        onclick: async () => {
          const data = await exportAll();
          downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `chez-moi-export-${new Date().toISOString().slice(0, 10)}.json`);
          toast('Export téléchargé.');
        },
      }),
    ])
  );

  wrap.appendChild(
    el('div', { class: 'card' }, [
      el('h3', { text: 'Entretien' }),
      el('button', {
        class: 'button button--ghost button--block',
        text: 'Nettoyer les photos orphelines',
        onclick: async () => {
          const removed = await pruneOrphanPhotos();
          toast(removed ? `${removed} photo(s) supprimée(s).` : 'Aucune photo orpheline.');
        },
      }),
      el('button', {
        class: 'button button--danger button--block',
        style: { marginTop: '10px' },
        text: 'Tout effacer',
        onclick: async () => {
          if (!(await confirmDialog('Effacer définitivement toutes vos données locales ? Cette action est irréversible.', { confirmLabel: 'Tout effacer' }))) return;
          await wipeEverything();
          toast('Données effacées.');
          location.hash = '#/';
          location.reload();
        },
      }),
    ])
  );

  wrap.appendChild(
    el('div', { class: 'card card--flat' }, [
      el('h3', { text: 'À propos' }),
      el('p', { class: 'small muted', text: "Chez Moi est une application web installable. Les estimations de dimensions viennent de l'analyse des photos : mesurez toujours avant d'acheter." }),
      el('p', { class: 'small muted', text: `Version 0.1.0 · ${formatDate(new Date().toISOString())}` }),
    ])
  );

  return wrap;
}
