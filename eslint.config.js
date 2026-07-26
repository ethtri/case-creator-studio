import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const establishedJsRecommended = {
  ...js.configs.recommended,
  rules: {
    ...js.configs.recommended.rules,
    "no-unassigned-vars": "off",
    "no-useless-assignment": "off",
    "preserve-caught-error": "off",
  },
};

const establishedReactHooksRules = {
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
};

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [establishedJsRecommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...establishedReactHooksRules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: [
      "src/hooks/**/*.{ts,tsx}",
      "src/pages/OrderSuccess.tsx",
      "supabase/functions/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "src/components/ui/**/*.{ts,tsx}",
      "src/contexts/**/*.{ts,tsx}",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["src/pages/Preview.tsx"],
    rules: {
      "react-hooks/exhaustive-deps": "off",
    },
  },
);
