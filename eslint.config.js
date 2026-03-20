import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended, // <--- Add this last!
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        GM_addStyle: "readonly",
        GM_xmlhttpRequest: "readonly",
        GM_setValue: "readonly",
        GM_getValue: "readonly",
      },
    },
    rules: {
      // You can still keep your custom logic rules here
      curly: ["error", "all"],
      "prettier/prettier": [
        "error",
        {
          semi: true,
          singleQuote: false,
          tabWidth: 2,
          trailingComma: "es5",
        },
      ],
    },
  },
);
