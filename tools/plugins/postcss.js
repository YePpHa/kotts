import postcss from "postcss";
import postcssrc from "postcss-load-config";
import fs from "node:fs/promises";
import config from "../../postcss.config.mjs";

export default {
  name: "postcss",
  /**
   * @param {import('esbuild').PluginBuild} build
   */
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      if (args.with.type !== "css") {
        return;
      }

      const { plugins, options } = await postcssrc({
        from: args.path,
        to: args.path,
      });

      const css = await fs.readFile(args.path, "utf8");
      const result = await postcss(plugins).process(css, options);

      return {
        contents: JSON.stringify(result.css),
        loader: "css",
      };
    });
  },
};
