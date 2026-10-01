// Flat config for the whole repository. One file, one source of truth;
// per-package overrides live in the `files:` entries below.

import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import";
import promisePlugin from "eslint-plugin-promise";
import tseslint from "typescript-eslint";

// Minimal globals. @types/node and DOM types cover the rest via tsc; this only
// quiets `no-undef` for runtime globals that lack TypeScript definitions.
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  getComputedStyle: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  fetch: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  crypto: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  HTMLElement: "readonly",
  HTMLInputElement: "readonly",
  HTMLButtonElement: "readonly",
  HTMLFormElement: "readonly",
  HTMLDivElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLTextAreaElement: "readonly",
  Event: "readonly",
  KeyboardEvent: "readonly",
  MouseEvent: "readonly",
  FormData: "readonly",
  Blob: "readonly",
  File: "readonly",
  Request: "readonly",
  Response: "readonly",
  Headers: "readonly",
  AbortController: "readonly",
  ResizeObserver: "readonly",
  MessageEvent: "readonly",
  postMessage: "readonly",
};

const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  crypto: "readonly",
  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  TextEncoder: "readonly",
  TextDecoder: "readonly",
  structuredClone: "readonly",
};

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/*.d.ts"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    plugins: { import: importPlugin, promise: promisePlugin },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...nodeGlobals },
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./packages/*/tsconfig.json"],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      // Unused code is a bug in the making. Leading underscore is the escape.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "promise/no-return-wrap": "error",
      "promise/param-names": "error",
      "promise/catch-or-return": ["error", { allowFinally: true }],
      "no-return-await": "error",
      "require-atomic-updates": "off",
      "import/no-extraneous-dependencies": "off",
      // warn, not error: the fixer cannot always resolve ordering for workspace
      // packages, which eslint-plugin-import classifies inconsistently.
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "index"],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // Browser code: the components run in a consumer's client bundle.
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...browserGlobals },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      "no-console": "error",
    },
  },

  // Test files may reach for looser types and console output.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/vitest.config.ts"],
    languageOptions: {
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },

  // Tooling that runs in a terminal, where printing IS the output.
  {
    files: ["*.{mjs,cjs,js}", "*.config.{js,mjs,cjs,ts}"],
    languageOptions: {
      globals: { ...nodeGlobals, module: "writable", require: "readonly", exports: "writable" },
    },
    rules: { "no-console": "off", "@typescript-eslint/no-require-imports": "off" },
  },

  prettierConfig,
);
