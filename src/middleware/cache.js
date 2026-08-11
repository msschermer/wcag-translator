import crypto from "node:crypto";

import { loadData } from "../data/loader.js";

let etag = null;

// The data set only changes when the image is rebuilt, so one ETag derived from
// the build checksum covers every data endpoint and lets clients revalidate
// cheaply instead of re-downloading criteria on every page load.
export function dataCache({ maxAge = 3600 } = {}) {
  return (req, res, next) => {
    etag ||= `W/"${crypto.createHash("sha1").update(loadData().index.checksum).digest("hex").slice(0, 20)}"`;

    res.setHeader("Cache-Control", `public, max-age=${maxAge}`);
    res.setHeader("ETag", etag);
    res.setHeader("X-Data-Source", "w3.org/WAI wcag.json");

    if (req.get("if-none-match") === etag) return res.status(304).end();
    return next();
  };
}
