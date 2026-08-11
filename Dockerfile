# syntax=docker/dockerfile:1

# --- build: install everything, fetch W3C data, normalise it, run the tests ---
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The image is self-contained: W3C data and the checker rule map are baked in at
# build time rather than fetched on boot. A container that cannot reach w3.org
# still serves correct guidance, and a W3C outage cannot take production down
# mid-restart.
#
# build:data also generates the axe-core rule map. axe-core is a dev dependency
# used only here; the runtime stage installs with --omit=dev, so it never ships.
RUN npm run sync:wcag && npm run build:data

# IBM Plex is copied out of the @fontsource dev dependencies into public/fonts.
# Self hosting keeps the strict CSP intact: `style-src 'self'` and
# `font-src 'self'` would block a Google Fonts stylesheet outright, and the
# blueprint identity would silently fall back to system faces.
RUN npm run build:fonts

# Tests run against the committed fixture, so this gate does not depend on the
# network fetch above having succeeded.
RUN npm test

# --- runtime: production deps and generated data only ---
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
COPY --from=build /app/openapi ./openapi
COPY --from=build /app/data/generated ./data/generated

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=8s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
