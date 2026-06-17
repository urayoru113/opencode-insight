import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.repository.url = pkg.repository.url.replace(/#.*/, "#" + pkg.version);
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
