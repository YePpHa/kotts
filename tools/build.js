import esbuild from "esbuild";
import postcss from "./plugins/postcss.js";

esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "browser",
  target: "chrome88",
  outfile: "dist/content_script.js",
  sourcemap: false,
  plugins: [postcss]
});
  