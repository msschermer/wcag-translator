import { ATTRIBUTION } from "./attribution.js";

export function ok(res, data, { status = 200, attribution = true, meta } = {}) {
  const payload = { data };
  if (meta) payload.meta = meta;
  if (attribution) payload.attribution = ATTRIBUTION;
  return res.status(status).json(payload);
}

export function errorResponse(res, status, message, details) {
  const payload = { error: { status, message } };
  if (details !== undefined) payload.error.details = details;
  return res.status(status).json(payload);
}
