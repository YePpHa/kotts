import fs from "node:fs";
import pckg from "../package.json" with { type: "json" };

export async function writeManifest() {
  const manifest = {
    "manifest_version": 3,
    "name": pckg.name,
    "version": pckg.version,
    "description": pckg.description,
    "permissions": [],
    "host_permissions": [
      "http://127.0.0.1:8880/*"
    ],
    "content_scripts": [
      {
        "matches": ["https://www.royalroad.com/fiction/*", "https://www.scribblehub.com/read/*", "https://www.fanfiction.net/s/*"],
        "js": ["content_script.js"],
        "world": "MAIN"
      }
    ]
  };

  fs.writeFileSync("./dist/manifest.json", JSON.stringify(manifest, null, 2));
}
