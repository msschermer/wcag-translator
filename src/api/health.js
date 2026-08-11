import { loadData } from "../data/loader.js";
import { config } from "../config/config.js";
import { ok } from "../utils/response.js";

// Reports data set age as well as liveness. W3C republish monthly, so a
// container that has been up for six months is serving stale guidance even
// though it is perfectly healthy by any other measure.
export function health(req, res) {
  const { index } = loadData();
  const ageDays = Math.floor((Date.now() - Date.parse(index.generatedAt)) / 86_400_000);

  return ok(
    res,
    {
      status: "ok",
      service: config.appName,
      version: config.version,
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      dataset: {
        generatedAt: index.generatedAt,
        ageDays,
        stale: ageDays > 45,
        checksum: index.checksum,
        versions: index.versions,
        counts: index.counts
      }
    },
    { attribution: false }
  );
}
