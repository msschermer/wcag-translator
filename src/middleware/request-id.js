import crypto from "node:crypto";

export function requestId(req, res, next) {
  const supplied = req.get("x-request-id");
  const id =
    supplied && supplied.length <= 100 && /^[\w.:-]+$/.test(supplied)
      ? supplied
      : crypto.randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
