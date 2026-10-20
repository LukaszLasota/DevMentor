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
  },
  cacheComponents: true,
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
