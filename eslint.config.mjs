import { globalIgnores } from "eslint/config";

export default [
  globalIgnores(["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.pnpm/**"]),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
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
];
