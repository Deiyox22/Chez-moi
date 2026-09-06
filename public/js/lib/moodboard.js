/** Builds a shareable moodboard PNG from the design, the user's photos and the palette. */

import { photoBlob } from './db.js';

const WIDTH = 1200;
const HEIGHT = 1500;

async function loadBitmap(photoId) {
  const blob = await photoBlob(photoId);
  if (!blob) return null;
  return createImageBitmap(blob).catch(() => null);
}

function drawCover(context, bitmap, x, y, width, height, radius = 16) {
  const scale = Math.max(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.clip();
  context.drawImage(bitmap, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  context.restore();
}

function wrapText(context, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {object} design saved design record
 * @param {object} room saved room record
 * @param {Array} furniture furniture items reused by the design
 */
export async function buildMoodboard(design, room, furniture) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  const result = design.result || {};

  context.fillStyle = '#faf7f2';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  context.fillStyle = '#201d19';
  context.font = '700 54px system-ui, sans-serif';
  const titleLines = wrapText(context, result.titre || 'Projet d\'aménagement', WIDTH - 120).slice(0, 2);
  titleLines.forEach((line, index) => context.fillText(line, 60, 100 + index * 60));

  let cursorY = 100 + titleLines.length * 60 + 10;
  context.fillStyle = '#5d574e';
  context.font = '400 26px system-ui, sans-serif';
  context.fillText(`${room?.nom || 'Pièce'} · ${result.directionStyle || ''}`.slice(0, 70), 60, cursorY);
  cursorY += 40;

  // Palette band
  const palette = (result.palette || []).slice(0, 6);
  if (palette.length) {
    const swatchWidth = (WIDTH - 120) / palette.length;
    palette.forEach((color, index) => {
      context.fillStyle = /^#[0-9a-f]{3,8}$/i.test(color.hex || '') ? color.hex : '#cccccc';
      context.beginPath();
      context.roundRect(60 + index * swatchWidth, cursorY, swatchWidth - 8, 90, 12);
      context.fill();
    });
    context.fillStyle = '#5d574e';
    context.font = '400 20px system-ui, sans-serif';
    palette.forEach((color, index) => {
      context.fillText(String(color.nom || '').slice(0, 14), 62 + index * swatchWidth, cursorY + 118);
    });
    cursorY += 150;
  }

  // Room photo
  const roomPhoto = room?.photoIds?.[0] ? await loadBitmap(room.photoIds[0]) : null;
  if (roomPhoto) {
    drawCover(context, roomPhoto, 60, cursorY, WIDTH - 120, 420, 20);
    cursorY += 450;
  }

  // Reused furniture strip
  const reused = (furniture || []).slice(0, 4);
  if (reused.length) {
    context.fillStyle = '#201d19';
    context.font = '600 30px system-ui, sans-serif';
    context.fillText('Vos meubles réutilisés', 60, cursorY + 10);
    cursorY += 36;
    const tileWidth = (WIDTH - 120 - 24 * (reused.length - 1)) / reused.length;
    for (let index = 0; index < reused.length; index += 1) {
      const item = reused[index];
      const x = 60 + index * (tileWidth + 24);
      const bitmap = item.photoIds?.[0] ? await loadBitmap(item.photoIds[0]) : null;
      if (bitmap) drawCover(context, bitmap, x, cursorY, tileWidth, tileWidth, 14);
      else {
        context.fillStyle = '#f0ebe3';
        context.beginPath();
        context.roundRect(x, cursorY, tileWidth, tileWidth, 14);
        context.fill();
      }
      context.fillStyle = '#5d574e';
      context.font = '400 20px system-ui, sans-serif';
      wrapText(context, item.nom, tileWidth).slice(0, 2).forEach((line, lineIndex) => {
        context.fillText(line, x, cursorY + tileWidth + 28 + lineIndex * 24);
      });
    }
    cursorY += tileWidth + 90;
  }

  // Summary
  context.fillStyle = '#201d19';
  context.font = '400 24px system-ui, sans-serif';
  wrapText(context, result.resume || '', WIDTH - 120)
    .slice(0, 5)
    .forEach((line, index) => context.fillText(line, 60, cursorY + index * 34));

  context.fillStyle = '#8b8479';
  context.font = '400 20px system-ui, sans-serif';
  context.fillText('Généré avec Chez Moi', 60, HEIGHT - 40);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
