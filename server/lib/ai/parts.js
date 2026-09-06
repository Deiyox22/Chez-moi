/**
 * Provider-neutral message parts.
 *
 * Routes build a list of these; each provider adapter converts them into its own
 * content format. Keeping the routes free of provider details is what lets the
 * same prompts run on Claude or on Gemini.
 */

const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const textPart = (text) => ({ kind: 'text', text: String(text) });

/**
 * @param {Array<{media_type: string, data: string}>} images payload sent by the PWA
 */
export function imageParts(images = []) {
  return images.map((image, index) => {
    const mediaType = ALLOWED_MEDIA_TYPES.has(image.media_type) ? image.media_type : 'image/jpeg';
    const data = String(image.data || '').replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
    if (!data) {
      const error = new Error(`La photo ${index + 1} est vide ou illisible.`);
      error.status = 400;
      throw error;
    }
    return { kind: 'image', mediaType, data };
  });
}
