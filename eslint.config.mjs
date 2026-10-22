import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Package boundaries (AGENTS.md): app → core → db; ui is standalone and used by app only.
const restrict = (patterns) => ({
  "no-restricted-imports": ["error", { patterns }],
});

const NEXT_AND_REACT = [
  { group: ["next", "next/*", "react", "react/*", "react-dom", "react-dom/*"], message: "This package must stay framework-agnostic." },
];
const MIKRO_ORM = [
  { group: ["@mikro-orm/*"], message: "Only @devmentor/db may import MikroORM; use the types it re-exports." },
];
const pkg = (name, message) => ({ group: [`@devmentor/${name}`, `@devmentor/${name}/*`], message });

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: { next: { rootDir: "packages/app/" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["packages/app/**"],
    rules: restrict([
      ...MIKRO_ORM,
      pkg("db", "app talks to the database through @devmentor/core services, never @devmentor/db directly."),
    ]),
  },
  {
    files: ["packages/core/**"],
    rules: restrict([
      ...NEXT_AND_REACT,
      ...MIKRO_ORM,
      pkg("app", "core must not depend on app."),
      pkg("ui", "core must not depend on ui."),
    ]),
  },
  {
    files: ["packages/db/**"],
    rules: restrict([
      ...NEXT_AND_REACT,
      pkg("app", "db is a leaf package."),
      pkg("core", "db is a leaf package; core depends on db, not the other way round."),
      pkg("ui", "db is a leaf package."),
    ]),
  },
  {
    files: ["packages/ui/**"],
    rules: restrict([
      ...MIKRO_ORM,
      pkg("app", "ui must not depend on app."),
      pkg("core", "ui is standalone; mirror shared shapes locally (see AGENTS.md)."),
      pkg("db", "ui must not depend on db."),
    ]),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/next-env.d.ts",
    "**/coverage/**",
    "**/storybook-static/**",
  ]),
]);

export default eslintConfig;
