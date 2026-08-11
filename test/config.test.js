import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

// Express treats a string trust proxy value as an address list, and ipaddr.js
// parses "1" as the IPv4 address 0.0.0.1. The result is a server that trusts
// nobody while looking like it trusts one hop, which silently merges every
// client behind the reverse proxy into a single rate limit bucket.
test("a numeric trust proxy setting honours X-Forwarded-For", async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/ip`, {
    headers: { "x-forwarded-for": "203.0.113.9" }
  });
  const body = await res.json();
  await new Promise((r) => server.close(r));

  assert.equal(body.ip, "203.0.113.9");
});

test("a string trust proxy setting silently ignores X-Forwarded-For", async () => {
  const app = express();
  app.set("trust proxy", "1"); // the bug, pinned so nobody reintroduces it
  app.get("/ip", (req, res) => res.json({ ip: req.ip }));

  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/ip`, {
    headers: { "x-forwarded-for": "203.0.113.9" }
  });
  const body = await res.json();
  await new Promise((r) => server.close(r));

  assert.notEqual(body.ip, "203.0.113.9");
});

test("config coerces TRUST_PROXY to a number", async () => {
  process.env.TRUST_PROXY = "2";
  const { config } = await import(`../src/config/config.js?fresh=${Date.now()}`);
  assert.equal(typeof config.trustProxy, "number");
  assert.equal(config.trustProxy, 2);
  delete process.env.TRUST_PROXY;
});
