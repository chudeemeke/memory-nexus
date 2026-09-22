#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { discoverInventory, validateInventory } from "./quality-inventory";

try {
  const args = process.argv.slice(2);
  if (!(args.length === 1 && args[0] === "--catalog") && !(args.length === 2 && args[0] === "--check")) {
    throw new Error("Usage: bun run scripts/check-quality-inventory.ts --catalog | --check <manifest.json>");
  }
  const catalog = discoverInventory(process.cwd());
  if (args[0] === "--catalog") {
    console.log(JSON.stringify(catalog, null, 2));
  } else {
    const issues = validateInventory(catalog, JSON.parse(readFileSync(args[1]!, "utf8")));
    if (issues.length) {
      console.error(`Inventory structure: FAIL (${issues.length} issues)`);
      for (const issue of issues.slice(0, 20)) console.error(`  - ${issue}`);
      if (issues.length > 20) console.error(`  ... ${issues.length - 20} more issues`);
      process.exitCode = 1;
    } else {
      console.log(`Inventory structure: valid (${catalog.files.length} files, ${catalog.packages.length} packages)`);
      console.log("Structural validation does not approve classifications, exclusions or coverage. Independent review remains required.");
    }
  }
} catch (error) {
  console.error(`Inventory: ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
