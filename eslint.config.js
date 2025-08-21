// eslint.config.js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default tseslint.config(
  eslint.configs.recommended, // ESLint's recommended rules
  ...tseslint.configs.recommended, // TypeScript-ESLint's recommended rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"], // Apply to JS, JSX, TS, TSX files
    ignores: ["dist/**", "src-tauri/**", "**/target/**", "**/node_modules/**"],
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
  // Add more configurations for specific file types or overrides if necessary
);
