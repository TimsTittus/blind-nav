import next from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

/**
 * Flat ESLint config.
 *
 * Layers:
 *  - eslint-config-next            → Next core-web-vitals + React + jsx-a11y
 *  - eslint-config-next/typescript → typescript-eslint recommended rules
 *  - eslint-config-prettier        → disables rules that conflict with
 *                                    Prettier (kept LAST so it wins)
 *
 * Project rules below enforce the architectural constraint that we never use
 * `any` and never leave values implicitly `any`.
 */
const config = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  ...nextTypescript,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
