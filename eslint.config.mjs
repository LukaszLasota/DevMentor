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
    // Public pages are Tailwind-only: components come from `@devmentor/ui/mentors`, never the admin barrel
    // (spec 2026-10-21-mentor-page). Repeats the app patterns because a later block replaces the rule.
    files: ["packages/app/src/app/(marketing)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // Exact entries (`paths`): `@devmentor/ui/mentors` and `@devmentor/ui/theme.css` stay allowed.
          paths: ["@devmentor/ui", "@devmentor/ui/styles.css"].map((name) => ({
            name,
            message: "Public (marketing) pages use @devmentor/ui/mentors (Tailwind only), not the panel barrel.",
          })),
          patterns: [
            ...MIKRO_ORM,
            pkg("db", "app talks to the database through @devmentor/core services, never @devmentor/db directly."),
          ],
        },
      ],
    },
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
    // Client-safe entry `@devmentor/core/validators`: Zod schemas only (also guarded by validators/index.test.ts).
    // Repeats the core patterns because a later block replaces the rule instead of merging it.
    files: ["packages/core/src/validators/**"],
    ignores: ["**/*.test.ts"],
    rules: restrict([
      ...NEXT_AND_REACT,
      ...MIKRO_ORM,
      pkg("app", "core must not depend on app."),
      pkg("ui", "core must not depend on ui."),
      pkg("db", "validators are client-safe; they must not import the database package."),
      pkg("core", "validators are client-safe; import nothing else from core."),
      {
        // `domain/` is the one client-safe core folder validators may use (spec 2026-10-21-mentor-page:
        // the stack-tag vocabulary feeds the Zod enum); it guards its own imports in domain/index.test.ts.
        group: ["server-only", "node:*", "pino", "jose", "awilix", "../../*", "../../../*", "!../../domain", "!../../domain/**"],
        message: "validators are client-safe: import only zod, files inside validators/ and core/src/domain/.",
      },
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
    // ui never imports next (it is framework-agnostic), so `next/link` is not an option there; the
    // app wraps ui links with its router where needed. Without this, every route the app adds
    // (e.g. /m/[slug]) turns a plain <a> in ui into a lint error.
    files: ["packages/ui/**"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
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
  {
    // Lessons 14 and 17: a blank or ad-hoc mentor name came back twice (#85, then #87 in three more
    // services) because each service wrote its own fallback. Names shown to people go through
    // `services/mentors/mentor-name.ts`, which also treats '' and whitespace as missing.
    files: ["packages/core/src/services/**/*.ts"],
    ignores: ["packages/core/src/services/mentors/mentor-name.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "LogicalExpression[operator=/^(\\?\\?|\\|\\|)$/][left.property.name='displayName']:matches([right.type='Literal'][right.value=/./], [right.type='Literal'][right.value=''], [right.type='TemplateLiteral'])",
          message:
            "No inline fallback for a mentor's displayName: use mentorNameForMentee / mentorNameForMenteeInSentence / mentorNameForOperator from services/mentors/mentor-name.ts (they also catch '' and whitespace).",
        },
      ],
    },
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
    "packages/ui/.storybook/public/**",
    "lekcja-07/**",
  ]),
]);

export default eslintConfig;
