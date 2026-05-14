import fs from "node:fs/promises";

import { buildScripts } from "./buildScripts.js";
import { writeManifest } from "./writeManifest.js";

const isWatch = process.argv.includes("--watch");

await buildScripts();
await writeManifest();

if (isWatch) {
  console.log("Watching for changes...");
  const changes = fs.watch("./src", { recursive: true });
  for await (const _ of changes) {
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
