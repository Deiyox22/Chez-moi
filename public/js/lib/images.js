/** Camera capture, downscaling, and base64 conversion for the API. */

import { el, toast } from './ui.js';

const MAX_EDGE = 1568; // Anthropic vision works best at or under this edge length
const JPEG_QUALITY = 0.82;

/** Downscales a File/Blob into a compact JPEG blob. */
export async function normalizeImage(fileOrBlob) {
  const bitmap = await createImageBitmap(fileOrBlob).catch(() => null);
  if (!bitmap) throw new Error("Cette image n'a pas pu être lue.");

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error("L'image n'a pas pu être convertie.");
  return blob;
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function blobsToImagePayload(blobs) {
  return Promise.all(
    blobs.map(async (blob) => ({ media_type: 'image/jpeg', data: await blobToBase64(blob) }))
  );
}

/** Opens the file picker; on phones this offers the camera directly. */
export function pickImages({ multiple = true, camera = false } = {}) {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    if (multiple) input.multiple = true;
    if (camera) input.capture = 'environment';
    input.addEventListener('change', () => {
      resolve(Array.from(input.files || []));
      input.remove();
    });
    input.addEventListener('cancel', () => { resolve([]); input.remove(); });
    document.body.appendChild(input);
    input.click();
  });
}

export const cameraSupported = () => Boolean(navigator.mediaDevices?.getUserMedia);

/**
 * Live camera sheet. Resolves with an array of captured blobs (already downscaled).
 * Falls back to the file picker when getUserMedia is unavailable or refused.
 */
export async function captureFromCamera({ openModal }) {
  if (!cameraSupported()) {
    const files = await pickImages({ multiple: true, camera: true });
    return Promise.all(files.map(normalizeImage));
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
  } catch {
    toast("Accès à la caméra refusé, ouverture de la galerie.", 'error');
    const files = await pickImages({ multiple: true, camera: true });
    return Promise.all(files.map(normalizeImage));
  }

  return new Promise((resolve) => {
    const captured = [];
    const video = el('video', { class: 'camera-video', autoplay: true, playsinline: true, muted: true });
    video.srcObject = stream;

    const counter = el('p', { class: 'small muted', text: 'Aucune photo prise pour le moment.' });
    const stop = () => stream.getTracks().forEach((track) => track.stop());

    const shoot = async () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1568 / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', JPEG_QUALITY));
      if (blob) {
        captured.push(blob);
        counter.textContent = `${captured.length} photo${captured.length > 1 ? 's' : ''} prise${captured.length > 1 ? 's' : ''}.`;
      }
    };

    const close = openModal('Prendre une photo', (dismiss) =>
      el('div', { class: 'stack' }, [
        video,
        counter,
        el('div', { class: 'row' }, [
          el('button', { class: 'button grow', text: 'Capturer', onclick: shoot }),
          el('button', {
            class: 'button button--ghost',
            text: 'Galerie',
            onclick: async () => {
              const files = await pickImages({ multiple: true });
              const blobs = await Promise.all(files.map(normalizeImage));
              captured.push(...blobs);
              stop();
              dismiss();
              resolve(captured);
            },
          }),
        ]),
        el('button', {
          class: 'button button--soft button--block',
          text: 'Terminer',
          onclick: () => { stop(); dismiss(); resolve(captured); },
        }),
      ])
    );
    void close;

    const observer = new MutationObserver(() => {
      if (!document.getElementById('modal-root').contains(video)) {
        stop();
        observer.disconnect();
        resolve(captured);
      }
    });
    observer.observe(document.getElementById('modal-root'), { childList: true, subtree: true });
  });
}
