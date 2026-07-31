/**
 * Stable integration seam used by Track A routes and graph services.
 * Track E owns the implementation and all Mistral SDK access under ./mistral.
 */
export {
  findContradictions,
  generateGraphFromText,
} from './mistral';
