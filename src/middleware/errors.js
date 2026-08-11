import { errorResponse } from "../utils/response.js";

export function notFound(req, res) {
  return errorResponse(res, 404, "Endpoint not found.", { see: "/v1/meta" });
}

export function errorHandler(error, req, res, next) {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      message: error.message
    })
  );

  if (res.headersSent) return next(error);

  if (error.type === "entity.too.large") {
    return errorResponse(res, 413, "Request body is too large.");
  }
  if (error.type === "entity.parse.failed" || error instanceof SyntaxError) {
    return errorResponse(res, 400, "Request body is not valid JSON.");
  }

  return errorResponse(res, 500, "Internal server error.", { requestId: req.requestId });
}
