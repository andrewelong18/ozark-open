import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design-system reference sources (Babel-in-browser JSX + bundle), now the
    // ozark-open-design skill. Canonical visual reference, not part of this app's build.
    ".claude/skills/ozark-open-design/**",
  ]),
]);

export default eslintConfig;
