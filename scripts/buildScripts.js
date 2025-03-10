import esbuild from "esbuild";
import postcss from "./plugins/postcss.js";
import uint8array from "./plugins/uint8array.js";

export async function buildScripts() {
  await esbuild.build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "browser",
    target: "chrome88",
    outfile: "dist/content_script.js",
    sourcemap: false,
    plugins: [postcss, uint8array]
  });
}
