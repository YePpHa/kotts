import fs from "node:fs/promises";

export default {
  name: "uint8array",
  /**
   * @param {import('esbuild').PluginBuild} build
   */
  setup(build) {
    build.onLoad({ filter: /./ }, async (args) => {
      if (args.with.type !== "uint8array") {
        return;
      }

      const file = await fs.readFile(args.path);

      return {
        contents: `export default new Uint8Array(${JSON.stringify(Array.from(file))});`,
        loader: "js",
      };
    });
  },
};
