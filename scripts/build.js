import { buildScripts } from "./buildScripts.js";
import { writeManifest } from "./writeManifest.js";
import fs from "node:fs/promises";

const isWatch = process.argv.includes("--watch");

(async () => {
  buildScripts();
  await writeManifest();

  if (isWatch) {
    console.log("Watching for changes...");
    const changes = fs.watch("./src", { recursive: true });
    for await (const event of changes) {
      console.log("Changes detected, rebuilding...");
      try {
        await buildScripts();
        await writeManifest();
      } catch (err) {
        console.error(err);
      }
      console.log("Watching for changes...");
    }
  }
})();