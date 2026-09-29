import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import type { Stats } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import ts from "typescript";

export interface InventoryFile {
  path: string;
  package: string;
  sourceHash: string;
  language: string;
  syntax: "no-local-code" | "re-export" | "executable" | "test-driver" | "browser-code" | "static-html" | "unsupported";
  imports: string[];
  declarations: string[];
  calls: string[];
}

export interface InventoryPackage {
  path: string;
  name: string;
  sourceHash: string;
}

export interface InventoryCatalog {
  schemaVersion: 1;
  packages: InventoryPackage[];
  files: InventoryFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Structural admission only. This cannot approve a risk judgment or exclusion. */
export function validateInventory(catalog: InventoryCatalog, manifest: unknown): string[] {
  if (!isRecord(manifest) || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !Array.isArray(manifest.packages)) {
    return ["Malformed inventory manifest"];
  }
  const issues: string[] = [];
  function reconcile(expected: Array<{ path: string; sourceHash: string }>, rows: unknown[], kind: "package" | "classification") {
    const known = new Map(expected.map(item => [item.path, item]));
    const seen = new Set<string>();
    for (const row of rows) {
      if (!isRecord(row) || typeof row.path !== "string") { issues.push(`Malformed ${kind} entry`); continue; }
      if (seen.has(row.path)) issues.push(`Duplicate ${kind}: ${row.path}`);
      seen.add(row.path);
      const actual = known.get(row.path);
      if (!actual) { issues.push(`Unknown ${kind}: ${row.path}`); continue; }
      if (row.sourceHash !== actual.sourceHash) issues.push(`Stale ${kind}: ${row.path}`);
      if (kind === "package") {
        if (row.name !== (actual as InventoryPackage).name) issues.push(`Wrong package name: ${row.path}`);
        continue;
      }
      const file = actual as InventoryFile;
      if (row.package !== file.package) issues.push(`Wrong package boundary: ${row.path}`);
      if (!["S", "A", "B"].includes(row.tier as string)) issues.push(`Unknown risk tier: ${row.path}`);
      if (typeof row.rationale !== "string" || !row.rationale.trim()) issues.push(`Missing risk rationale: ${row.path}`);
      const applicability = row.applicability;
      if (!isRecord(applicability) || !["measure", "no-local-code", "proposed-exclusion", "external-runtime"].includes(applicability.mode as string) ||
          typeof applicability.reason !== "string" || !applicability.reason.trim()) {
        issues.push(`Missing or invalid applicability: ${row.path}`);
      } else {
        if (applicability.mode === "no-local-code" && !["no-local-code", "static-html"].includes(file.syntax)) issues.push(`Executable cannot claim no local code: ${row.path}`);
        if (applicability.mode === "measure" && ["unsupported", "browser-code", "static-html"].includes(file.syntax)) issues.push(`Separate runtime measurement required: ${row.path}`);
      }
    }
    for (const item of expected) if (!seen.has(item.path)) issues.push(`Missing ${kind}: ${item.path}`);
  }
  reconcile(catalog.packages, manifest.packages, "package");
  reconcile(catalog.files, manifest.files, "classification");
  return issues;
}

export function sourceHash(source: string): string {
  return createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
}

function inspectSyntax(path: string, source: string): Pick<InventoryFile, "syntax" | "imports" | "declarations" | "calls"> {
  const empty = { imports: [], declarations: [], calls: [] };
  if (/\.html?$/i.test(path)) {
    // Deliberately conservative: script tags, event handlers and script URLs
    // require browser review even when a string occurs inside an HTML comment.
    return { ...empty, syntax: /<script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(source) ? "browser-code" : "static-html" };
  }
  if (!/\.[cm]?[jt]sx?$/i.test(path)) return { ...empty, syntax: "unsupported" };
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports = new Set<string>(), declarations = new Set<string>(), calls = new Set<string>(), testNames = new Set<string>();
  for (const statement of parsed.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      imports.add(statement.moduleSpecifier.text);
      const bindings = statement.importClause?.namedBindings;
      if (statement.moduleSpecifier.text === "bun:test" && bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          if (["test", "it", "describe"].includes(binding.propertyName?.text ?? binding.name.text)) testNames.add(binding.name.text);
        }
      }
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) imports.add(statement.moduleSpecifier.text);
  }
  function callName(node: ts.Node): string | undefined {
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isPropertyAccessExpression(node)) {
      const parent = callName(node.expression);
      return parent ? `${parent}.${node.name.text}` : undefined;
    }
    if (ts.isCallExpression(node)) return callName(node.expression);
    return undefined;
  }
  let registersTests = false;
  function visit(node: ts.Node): void {
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isMethodDeclaration(node) || ts.isVariableDeclaration(node)) && node.name && ts.isIdentifier(node.name)) declarations.add(node.name.text);
    if (ts.isCallExpression(node)) {
      const name = callName(node.expression);
      if (name) {
        calls.add(name);
        if (testNames.has(name.split(".")[0]!)) registersTests = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  // Inspect declaration-file content without asking TypeScript to emit a .d.ts
  // input (which suppresses output and can hide accidental runtime statements).
  const compiled = ts.transpileModule(source, { fileName: path.replace(/\.d\.([cm]?ts)$/i, ".inspection.$1"), reportDiagnostics: true, compilerOptions: {
    // Preserve value imports conservatively: possible module-load effects must
    // not be mistaken for declaration-only code because an import is unused.
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, removeComments: true, verbatimModuleSyntax: true,
  } });
  const errors = compiled.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error) ?? [];
  if (errors.length) throw new Error(`Cannot classify invalid source: ${path}: ${ts.flattenDiagnosticMessageText(errors[0]!.messageText, " ")}`);
  const emitted = ts.createSourceFile("output.js", compiled.outputText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const noLocalCode = emitted.statements.every(statement => ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length === 0);
  const onlyReexports = emitted.statements.every(statement => ts.isExportDeclaration(statement) && !!statement.moduleSpecifier);
  return { syntax: noLocalCode ? "no-local-code" : onlyReexports ? "re-export" : registersTests ? "test-driver" : "executable",
    imports: [...imports].sort(), declarations: [...declarations].sort(), calls: [...calls].sort() };
}

function inspectPath(root: string, path: string): Stats {
  if (!path || /[\x00-\x1f\\:]/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe inventory path: ${JSON.stringify(path)}`);
  }
  const parts = path.split("/");
  for (let index = 1; index <= parts.length; index++) {
    const current = join(root, ...parts.slice(0, index));
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || (index < parts.length ? !stat.isDirectory() : !stat.isFile() && !stat.isDirectory())) {
      throw new Error(`Inventory refuses linked or special files: ${path}`);
    }
  }
  return lstatSync(join(root, path));
}

function readRegularSource(root: string, path: string): string {
  if (!inspectPath(root, path).isFile()) throw new Error(`Inventory requires a regular file: ${path}`);
  return readFileSync(join(root, path), "utf8");
}

export function discoverInventory(projectRoot: string): InventoryCatalog {
  const root = resolve(projectRoot);
  const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
  if (realpathSync(root) !== realpathSync(gitRoot)) throw new Error("Inventory requires the repository root");
  const tracked = [...new Set(execFileSync("git", ["ls-files", "-z", "--cached"], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  }).split("\0").filter(Boolean))].sort();
  const executablePaths = new Set(execFileSync("git", ["ls-files", "--stage", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 })
    .split("\0").filter(entry => entry.startsWith("100755 ")).map(entry => entry.slice(entry.indexOf("\t") + 1)));
  const folded = new Set<string>();
  const sources = new Map<string, string>();
  function addSource(path: string): void {
    if (sources.has(path)) return;
    if (folded.has(path.toLowerCase())) throw new Error(`Case-colliding inventory path: ${path}`);
    folded.add(path.toLowerCase());
    sources.set(path, readRegularSource(root, path));
  }
  // Check tracked ancestors before asking Git to inspect untracked paths. Git on
  // Windows follows junctions when recursively enumerating --others by itself.
  for (const path of tracked) addSource(path);
  function addUntracked(path: string): void {
    const stat = inspectPath(root, path);
    if (stat.isFile()) { addSource(path); return; }
    const children = readdirSync(join(root, path)).map(name => `${path}/${name}`);
    if (!children.length) return;
    const ignored = spawnSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
      cwd: root, encoding: "utf8", input: children.join("\0") + "\0", maxBuffer: 16 * 1024 * 1024,
    });
    if (ignored.status !== 0 && ignored.status !== 1) throw new Error(`Cannot evaluate ignored paths under: ${path}`);
    const skipped = new Set(ignored.stdout.split("\0").filter(Boolean));
    for (const child of children) {
      if (skipped.has(child)) continue;
      if (child.endsWith("/.git")) throw new Error(`Unregistered nested repository: ${path}`);
      addUntracked(child);
    }
  }
  const untracked = execFileSync("git", ["ls-files", "-z", "--others", "--exclude-standard", "--directory"], {
    cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  }).split("\0").filter(Boolean);
  for (const path of untracked) addUntracked(path.replace(/\/$/, ""));
  const paths = [...sources.keys()].sort();
  const packages = paths.filter(path => path === "package.json" || path.endsWith("/package.json")).map(path => {
    const source = sources.get(path)!;
    const value: unknown = JSON.parse(source);
    if (!value || typeof value !== "object" || !("name" in value) || typeof value.name !== "string" || !value.name.trim()) {
      throw new Error(`Invalid package manifest: ${path}`);
    }
    return { path, name: value.name, sourceHash: sourceHash(source) };
  });
  if (!packages.some(pkg => pkg.path === "package.json")) throw new Error("Root package manifest is required");
  const extensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".py", ".sh", ".bash", ".ps1", ".cmd", ".bat", ".html", ".htm"]);
  const files = paths.filter(path => extensions.has(extname(path).toLowerCase()) || executablePaths.has(path) || sources.get(path)!.startsWith("#!")).map(path => {
    const owner = packages.filter(pkg => pkg.path === "package.json" || path.startsWith(dirname(pkg.path).replaceAll("\\", "/") + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0]!;
    const source = sources.get(path)!;
    return { path, package: owner.path, sourceHash: sourceHash(source), language: extname(path).toLowerCase() || "shebang", ...inspectSyntax(path, source) };
  });
  return { schemaVersion: 1, packages, files };
}
