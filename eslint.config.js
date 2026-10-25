// eslint.config.js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

const importsFrom = (layers, message) => ({
  regex: `^(?:@/|(?:\\.\\./)+)(?:${layers.join("|")})(?:/|$)`,
  message,
});

const layerBoundaries = [
  {
    files: ["app/lib/**"],
    patterns: [
      importsFrom(
        [
          "components",
          "data",
          "hooks",
          "pages",
          "prompts",
          "repositories",
          "services",
          "store",
          "themes",
        ],
        "lib imports only lib and types.",
      ),
    ],
  },
  {
    files: ["app/types/**"],
    patterns: [
      importsFrom(
        [
          "components",
          "data",
          "hooks",
          "lib",
          "pages",
          "prompts",
          "repositories",
          "services",
          "store",
          "themes",
        ],
        "types import only other types.",
      ),
    ],
  },
  {
    files: ["app/repositories/**"],
    patterns: [
      importsFrom(
        ["components", "hooks", "pages", "store"],
        "Repositories don't import hooks, components, pages or stores.",
      ),
      {
        regex: "^(?:@/|(?:\\.\\./)+)services(?:/(?!db(?:/|$))|$)",
        message: "Repositories import only the db module from services.",
      },
    ],
  },
  {
    files: ["app/services/**"],
    patterns: [
      importsFrom(
        ["components", "hooks", "pages"],
        "Services don't import hooks, components or pages.",
      ),
    ],
  },
  {
    files: ["app/store/**"],
    patterns: [
      importsFrom(
        ["components", "hooks", "pages", "repositories", "services"],
        "Stores don't import services, repositories, hooks, components or pages.",
      ),
    ],
  },
  {
    files: ["app/hooks/**"],
    patterns: [
      importsFrom(
        ["components", "pages"],
        "Hooks don't import components or pages.",
      ),
    ],
  },
  {
    files: ["app/components/**", "app/pages/**"],
    patterns: [
      importsFrom(
        ["repositories"],
        "Components and pages reach repositories through a service.",
      ),
    ],
  },
];

export default tseslint.config(
  {
    ignores: [
      "build/**",
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "scripts/**/*.cjs",
    ],
  },
  {
    files: ["*.js", "scripts/**/*.js", "scripts/**/*.cjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  eslint.configs.recommended, // ESLint's recommended rules
  ...tseslint.configs.recommended, // TypeScript-ESLint's recommended rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"], // Apply to JS, JSX, TS, TSX files
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules, // React recommended rules
      ...reactPlugin.configs["jsx-runtime"].rules, // Rules for new JSX transform
      ...reactHooksPlugin.configs.recommended.rules, // React Hooks recommended rules
      // Add or override specific rules as needed
      "react/react-in-jsx-scope": "off", // Not needed with new JSX transform
      // Allow unused variables that start with `_`
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
    settings: {
      react: {
        version: "detect", // Automatically detect React version
      },
    },
  },
  ...layerBoundaries.map(({ files, patterns }) => ({
    files,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "no-restricted-imports": ["error", { patterns }] },
  })),
  // Add more configurations for specific file types or overrides if necessary
);
