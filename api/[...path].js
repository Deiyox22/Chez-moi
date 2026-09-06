/** Vercel serverless entry point. Vercel serves public/ itself, so static files are off. */
import { handleRequest } from '../server/handler.js';

export default function handler(req, res) {
  return handleRequest(req, res, { staticFiles: false });
}
