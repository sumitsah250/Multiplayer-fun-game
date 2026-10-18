# Party Spy web build, served by nginx. Built for Coolify (or any Docker host).
#
# The EXPO_PUBLIC_* values are compiled into the JavaScript at build time, so
# pass them as build arguments (in Coolify: mark them as "Build Variable").
# Without them the game still works; only Private rooms show "not set up".

# ---- 1. Build the static web app ------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

ENV CI=1 \
    EXPO_NO_TELEMETRY=1

# Dependencies first, so this layer is cached until package files change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ARG EXPO_PUBLIC_SUPABASE_URL=""
ARG EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=""
ENV EXPO_PUBLIC_SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL \
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

RUN npx expo export --platform web --output-dir dist

# ---- 2. Serve it -------------------------------------------------------------
FROM nginx:1.28-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
