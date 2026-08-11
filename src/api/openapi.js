import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const specPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../openapi/openapi.yaml"
);

let cached = null;

// A spec file that ships in the image but is never served is decoration.
export function openapi(req, res) {
  cached ||= fs.readFileSync(specPath, "utf8");
  res.setHeader("Content-Type", "application/yaml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(cached);
}
