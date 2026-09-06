/** Renders the top-down layout returned by the model as an inline SVG. */

const SVG_NS = 'http://www.w3.org/2000/svg';

const FILLS = {
  possede: { fill: 'rgba(111, 138, 114, 0.34)', stroke: '#6f8a72' },
  a_acheter: { fill: 'rgba(181, 97, 63, 0.26)', stroke: '#b5613f' },
  existant: { fill: 'rgba(139, 132, 121, 0.22)', stroke: '#8b8479' },
};

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function truncate(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function renderPlan(plan) {
  const roomWidth = Math.max(Number(plan?.largeurCm) || 0, 100);
  const roomDepth = Math.max(Number(plan?.profondeurCm) || 0, 100);
  const pad = 40;
  const width = roomWidth + pad * 2;
  const height = roomDepth + pad * 2;

  const root = svg('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Plan de la pièce, ${Math.round(roomWidth)} sur ${Math.round(roomDepth)} centimètres`,
  });

  // Metre grid
  const grid = svg('g', { stroke: 'rgba(139,132,121,0.28)', 'stroke-width': 1 });
  for (let x = 0; x <= roomWidth; x += 100) {
    grid.appendChild(svg('line', { x1: pad + x, y1: pad, x2: pad + x, y2: pad + roomDepth }));
  }
  for (let y = 0; y <= roomDepth; y += 100) {
    grid.appendChild(svg('line', { x1: pad, y1: pad + y, x2: pad + roomWidth, y2: pad + y }));
  }
  root.appendChild(grid);

  root.appendChild(
    svg('rect', { x: pad, y: pad, width: roomWidth, height: roomDepth, fill: 'none', stroke: '#5d574e', 'stroke-width': 4 })
  );

  for (const item of plan?.elements || []) {
    const itemWidth = Math.max(Number(item.largeurCm) || 40, 20);
    const itemDepth = Math.max(Number(item.profondeurCm) || 40, 20);
    const x = pad + (Number(item.xCm) || 0);
    const y = pad + (Number(item.yCm) || 0);
    const rotation = Number(item.rotationDeg) || 0;
    const palette = FILLS[item.nature] || FILLS.existant;

    const group = svg('g', {
      transform: rotation ? `rotate(${rotation} ${x + itemWidth / 2} ${y + itemDepth / 2})` : '',
    });
    group.appendChild(
      svg('rect', {
        x, y, width: itemWidth, height: itemDepth, rx: 8,
        fill: palette.fill, stroke: palette.stroke, 'stroke-width': 2.5,
      })
    );
    const label = svg('text', {
      x: x + itemWidth / 2,
      y: y + itemDepth / 2 + 6,
      'text-anchor': 'middle',
      'font-size': Math.max(16, Math.min(22, itemWidth / 6)),
      fill: '#201d19',
      'font-family': 'system-ui, sans-serif',
      'font-weight': '600',
    });
    label.textContent = truncate(item.libelle, Math.max(8, Math.floor(itemWidth / 11)));
    group.appendChild(label);
    group.appendChild(svg('title')).textContent = `${item.libelle} — ${Math.round(itemWidth)}×${Math.round(itemDepth)} cm${item.note ? ` — ${item.note}` : ''}`;
    root.appendChild(group);
  }

  // Scale bar: one metre
  const barY = pad + roomDepth + 20;
  root.appendChild(svg('line', { x1: pad, y1: barY, x2: pad + 100, y2: barY, stroke: '#5d574e', 'stroke-width': 3 }));
  const scaleLabel = svg('text', { x: pad + 108, y: barY + 6, 'font-size': 20, fill: '#5d574e', 'font-family': 'system-ui, sans-serif' });
  scaleLabel.textContent = '1 m';
  root.appendChild(scaleLabel);

  return root;
}

export function planLegend() {
  const wrap = document.createElement('div');
  wrap.className = 'chips';
  const entries = [
    ['possede', 'Meuble que vous possédez'],
    ['a_acheter', 'À compléter'],
    ['existant', 'Élément déjà en place'],
  ];
  for (const [key, label] of entries) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const dot = document.createElement('span');
    dot.style.cssText = `width:10px;height:10px;border-radius:3px;display:inline-block;background:${FILLS[key].fill};border:1.5px solid ${FILLS[key].stroke}`;
    chip.append(dot, document.createTextNode(label));
    wrap.appendChild(chip);
  }
  return wrap;
}
