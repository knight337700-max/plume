import { globalIgnores } from "eslint/config";
import tsParser from "@typescript-eslint/parser";

export default [
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.pnpm/**"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../*/src/**", "../../*/src/**", "../../../*/src/**"],
              message:
                "Import another module through its public.ts interface instead of a source path.",
            },
            {
              group: ["astryx", "@astryx/*"],
              message: "Import Astryx only through packages/ui/src/astryx.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/infrastructure/src/db/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["astryx", "@astryx/*"],
              message: "Import Astryx only through packages/ui/src/astryx.",
            },
          ],
        },
      ],
    },
  },
];
