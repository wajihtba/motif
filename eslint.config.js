//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

export default [
  ...tanstackConfig,
  {
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
    },
  },
  {
    // Vendored shadcn components — generated code, keep lint quiet here.
    files: ["src/components/ui/**/*.tsx", "src/components/ui/**/*.ts"],
    rules: {
      "import/consistent-type-specifier-style": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-shadow": "off",
    },
  },
  {
    // Engine purity: the per-frame path is client-only vanilla TS.
    // React (or any framework) must never leak under these directories.
    files: [
      "src/engine/**/*.ts",
      "src/scene/**/*.ts",
      "src/effects/**/*.ts",
      "src/controller/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "react/*",
                "react-dom/*",
                "@tanstack/*",
              ],
              message:
                "Engine/scene/effects/controller code is framework-free. Bridge through src/hooks/ instead.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["eslint.config.js", ".prettierrc"],
  },
]
