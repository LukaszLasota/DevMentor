import path from "node:path";
import { loadEnvConfig, updateInitialEnv } from "@next/env";
import type { NextConfig } from "next";

// Env files live at the monorepo root, shared with the MikroORM CLI. Next has already
// loaded (and cached) env for this app directory, so force a reload from the root and
// add the parsed values to Next's initial snapshot so later env reloads keep them.
const { parsedEnv } = loadEnvConfig(path.resolve(process.cwd(), "../.."), process.env.NODE_ENV !== "production", console, true);
updateInitialEnv(parsedEnv ?? {});

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // MikroORM finds entity metadata by class, falling back to the class name. Route handlers and
    // pages are separate server bundles, each with its own copy of the entity classes, while the ORM
    // is one per process (globalThis): with minified names a page's `User` ("l") is unknown to the
    // ORM that a route handler initialised ("Metadata for entity l not found"). Keep names intact.
    serverMinification: false,
  },
  cacheComponents: true,
  // /verify-email carries the link token in the URL fragment (never sent to servers); no-referrer also
  // keeps the page URL out of any Referer (sign-in spec, UI/UX). The page sets the same policy as a meta tag.
  async headers() {
    return [{ source: "/verify-email", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] }];
  },
  partialPrefetching: true,
  // Workspace packages (@devmentor/*) are transpiled by Turbopack automatically.
  serverExternalPackages: ["@mikro-orm/postgresql", "@mikro-orm/sql"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
