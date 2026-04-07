import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import eslintConfigPrettier from "eslint-config-prettier";
import tailwindcss from "eslint-plugin-tailwindcss";

export default defineConfig([
  globalIgnores(["**/node_modules/**", ".next/**", "**/components/ui/**"]),
  ...nextCoreWebVitals,
  {
    plugins: {
      tailwindcss,
    },
    rules: {
      ...eslintConfigPrettier.rules,
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/classnames-order": "off",
      // React Compiler / hooks rules are stricter in eslint-plugin-react-hooks v7 (Next 16).
      // Warn only until refactors; see https://react.dev/reference/eslint-plugin-react-hooks
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.json",
        },
      },
    },
  },
]);
