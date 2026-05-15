import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    singleQuote: false,
    semi: true,
    sortPackageJson: true,
    sortImports: {
      groups: [
        ["type-import"],
        ["type-builtin", "value-builtin"],
        ["type-external", "value-external", "type-internal", "value-internal"],
        [
          "type-parent",
          "type-sibling",
          "type-index",
          "value-parent",
          "value-sibling",
          "value-index",
        ],
        ["unknown"],
      ],
      newlinesBetween: true,
      order: "asc",
    },
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    plugins: ["unicorn", "typescript", "oxc"],
    rules: {
      curly: "error",
    },
  },
});
