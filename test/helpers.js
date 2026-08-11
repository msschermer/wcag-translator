import { createApp } from "../src/app.js";
import { resetRateLimits } from "../src/middleware/rate-limit.js";

export async function startTestServer() {
  resetRateLimits();
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  return {
    baseUrl,
    get: (path, init) => fetch(`${baseUrl}${path}`, init),
    post: (path, body, init = {}) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(init.headers || {}) },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init
      }),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
