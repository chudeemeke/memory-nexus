import { describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { openCoverageRun, recordCoverageRun, releaseCoverageWork } from "./coverage-run-storage";

async function expectReady(stream: ReadableStream<Uint8Array>): Promise<void> {
  const reader = stream.getReader();
  let output = "";
  try {
    while (!output.includes("READY")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    expect(output).toContain("READY");
  } finally { reader.releaseLock(); }
}

describe("coverage run ownership", () => {
  test.each([false, true])("owner-marker write failure cleans only an empty claim (partial marker: %s)", (partial) => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-marker-"));
    const project = join(fixture, "project");
    const work = join(fixture, "work");
    mkdirSync(project);
    const originalWrite = fs.writeFileSync;
    const write = spyOn(fs, "writeFileSync").mockImplementation(((path, data, options) => {
      if (String(path) === join(work, ".memory-coverage-owner.json")) {
        if (partial) originalWrite(path, "partial", options);
        throw Object.assign(new Error("synthetic marker ENOSPC"), { code: "ENOSPC" });
      }
      return originalWrite(path, data, options);
    }) as typeof fs.writeFileSync);
    const diagnostic = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(() => openCoverageRun(project, work, join(project, "coverage"))).toThrow("synthetic marker ENOSPC");
      expect(existsSync(work)).toBe(partial);
      if (partial) {
        expect(readFileSync(join(work, ".memory-coverage-owner.json"), "utf-8")).toBe("partial");
        expect(diagnostic.mock.calls.flat().join(" ")).toContain("Coverage ownership allocation incomplete:");
        expect(diagnostic.mock.calls.flat().join(" ")).toContain(work);
      }
    } finally {
      write.mockRestore();
      diagnostic.mockRestore();
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("report allocation failure releases the exclusively claimed working directory", () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-allocation-"));
    const project = join(fixture, "project");
    const work = join(fixture, "work");
    mkdirSync(project);
    const originalMkdir = fs.mkdirSync;
    const mkdir = spyOn(fs, "mkdirSync").mockImplementation(((path: fs.PathLike, options?: fs.MakeDirectoryOptions) => {
      if (basename(String(path)).startsWith("run-")) throw Object.assign(new Error("synthetic ENOSPC"), { code: "ENOSPC" });
      return originalMkdir(path, options);
    }) as typeof fs.mkdirSync);
    try {
      expect(() => openCoverageRun(project, work, join(project, "coverage"))).toThrow("synthetic ENOSPC");
      expect(existsSync(work)).toBe(false);
    } finally {
      mkdir.mockRestore();
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  test("concurrent child processes retain separate completed report generations", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-concurrent-"));
    const project = join(fixture, "project");
    const coverage = join(project, "coverage");
    mkdirSync(project);
    const seed = openCoverageRun(project, join(fixture, "seed"), coverage);
    recordCoverageRun(seed, 0);
    releaseCoverageWork(seed);
    const modulePath = resolve(import.meta.dir, "coverage-run-storage.ts");
    const children = ["first", "second"].map((name) => {
      const code = `import { openCoverageRun, recordCoverageRun, releaseCoverageWork } from ${JSON.stringify(modulePath)};
        const run = openCoverageRun(${JSON.stringify(project)}, ${JSON.stringify(join(fixture, name))}, ${JSON.stringify(coverage)});
        recordCoverageRun(run, 0); releaseCoverageWork(run); console.log(JSON.stringify(run.reportDir));`;
      return Bun.spawn([process.execPath, "--eval", code], { stdout: "pipe", stderr: "pipe" });
    });
    try {
      const results = await Promise.all(children.map(async (child) => ({
        output: await new Response(child.stdout).text(), exit: await child.exited,
      })));
      expect(results.map((result) => result.exit)).toEqual([0, 0]);
      const paths = results.map((result) => JSON.parse(result.output.trim()) as string);
      expect(paths[0]).not.toBe(paths[1]);
      for (const path of paths) {
        expect(JSON.parse(readFileSync(join(path, "run.json"), "utf-8")).status).toBe("complete");
      }
      expect(existsSync(join(fixture, "first"))).toBe(false);
      expect(existsSync(join(fixture, "second"))).toBe(false);
    } finally {
      for (const child of children) if (child.exitCode === null) { child.kill(); await child.exited; }
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 20000);

  (process.platform === "win32" ? test : test.skip)("retains ownership after a real Windows file lock interrupts cleanup", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-locked-"));
    const project = join(fixture, "project");
    mkdirSync(project);
    const run = openCoverageRun(project, join(fixture, "work"), join(project, "coverage"));
    const lockedFile = join(run.workDir, "locked.txt");
    writeFileSync(lockedFile, "locked content");
    const script = join(fixture, "hold.ps1");
    writeFileSync(script, 'param([string]$Target)\n$stream = [System.IO.File]::Open($Target, "Open", "ReadWrite", "None")\n[Console]::Out.WriteLine("READY")\n[Console]::Out.Flush()\n[Console]::In.ReadLine() | Out-Null\n$stream.Dispose()\n');
    const child = Bun.spawn(["powershell.exe", "-NoProfile", "-NonInteractive", "-File", script, lockedFile], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
    try {
      await expectReady(child.stdout);
      releaseCoverageWork(run);
      expect(existsSync(lockedFile)).toBe(true);
      expect(JSON.parse(readFileSync(join(run.workDir, ".memory-coverage-owner.json"), "utf-8"))).toEqual(run.owner);
      child.stdin.write("\n");
      child.stdin.end();
      expect(await child.exited).toBe(0);
      expect(readFileSync(lockedFile, "utf-8")).toBe("locked content");
      releaseCoverageWork(run);
      expect(existsSync(run.workDir)).toBe(false);
    } finally {
      if (child.exitCode === null) { child.kill(); await child.exited; }
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 20000);

  test("a copied marker cannot authorize cleanup of a replacement directory", () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-replacement-"));
    const project = join(fixture, "project");
    mkdirSync(project);
    try {
      const run = openCoverageRun(project, join(fixture, "work"), join(project, "coverage"));
      const marker = readFileSync(join(run.workDir, ".memory-coverage-owner.json"));
      renameSync(run.workDir, join(fixture, "original-work"));
      mkdirSync(run.workDir);
      writeFileSync(join(run.workDir, ".memory-coverage-owner.json"), marker);
      writeFileSync(join(run.workDir, "valuable.txt"), "replacement must survive");
      releaseCoverageWork(run);
      expect(readFileSync(join(run.workDir, "valuable.txt"), "utf-8")).toBe("replacement must survive");
      expect(existsSync(join(fixture, "original-work"))).toBe(true);
    } finally { rmSync(fixture, { recursive: true, force: true }); }
  });

  for (const corruption of ["malformed", "null", "oversized", "wrong-project", "wrong-role", "wrong-inode"] as const) {
    test(`refuses ${corruption} output ownership without overwriting reports`, () => {
      const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-corrupt-owner-"));
      const project = join(fixture, "project");
      const coverage = join(project, "coverage");
      mkdirSync(project);
      try {
        const run = openCoverageRun(project, join(fixture, "first"), coverage);
        releaseCoverageWork(run);
        const markerPath = join(coverage, ".memory-coverage-owner.json");
        const owner = JSON.parse(readFileSync(markerPath, "utf-8"));
        const bytes = corruption === "malformed" ? "{" : corruption === "null" ? "null"
          : corruption === "oversized" ? "x".repeat(4097)
          : JSON.stringify({ ...owner, ...(corruption === "wrong-project" ? { project: "foreign" }
            : corruption === "wrong-role" ? { role: "work" } : { inode: "wrong" }) });
        writeFileSync(markerPath, bytes);
        writeFileSync(join(coverage, "valuable.txt"), "preserve");
        expect(() => openCoverageRun(project, join(fixture, "second"), coverage)).toThrow("Refusing");
        expect(readFileSync(join(coverage, "valuable.txt"), "utf-8")).toBe("preserve");
        expect(readFileSync(markerPath, "utf-8")).toBe(bytes);
        expect(existsSync(join(fixture, "second"))).toBe(false);
      } finally { rmSync(fixture, { recursive: true, force: true }); }
    });
  }

  test("a killed process leaves attributable work and cannot block a new generation or authorize PID-based cleanup", async () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-crash-"));
    const project = join(fixture, "project");
    const work = join(fixture, "crashed-work");
    const coverage = join(project, "coverage");
    mkdirSync(project);
    const modulePath = resolve(import.meta.dir, "coverage-run-storage.ts");
    const code = `import { openCoverageRun } from ${JSON.stringify(modulePath)};
      openCoverageRun(${JSON.stringify(project)}, ${JSON.stringify(work)}, ${JSON.stringify(coverage)});
      console.log("READY"); setInterval(() => {}, 1000);`;
    const child = Bun.spawn([process.execPath, "--eval", code], { stdout: "pipe", stderr: "pipe" });
    try {
      const reader = child.stdout.getReader();
      let output = "";
      while (!output.includes("READY")) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output += new TextDecoder().decode(chunk.value);
      }
      reader.releaseLock();
      expect(output).toContain("READY");
      child.kill();
      expect(await child.exited).not.toBe(0);
      const markerPath = join(work, ".memory-coverage-owner.json");
      const marker = JSON.parse(readFileSync(markerPath, "utf-8"));
      expect(marker.pid).toBe(child.pid);
      // Model a reused PID in a retained record: no new invocation may reclaim it.
      writeFileSync(markerPath, JSON.stringify({ ...marker, pid: process.pid }));
      const changedMarker = readFileSync(markerPath, "utf-8");
      expect(() => openCoverageRun(project, work, coverage)).toThrow("existing workDir");
      expect(readFileSync(markerPath, "utf-8")).toBe(changedMarker);
      const next = openCoverageRun(project, join(fixture, "next-work"), coverage);
      releaseCoverageWork(next);
      expect(existsSync(work)).toBe(true);
      expect(existsSync(next.reportDir)).toBe(true);
    } finally {
      if (child.exitCode === null) { child.kill(); await child.exited; }
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 20000);

  test("missing ownership cannot be restored as permission to clean a directory", () => {
    const fixture = mkdtempSync(join(tmpdir(), "memory-coverage-owner-test-"));
    const project = join(fixture, "project");
    mkdirSync(project);
    try {
      const run = openCoverageRun(project, join(fixture, "work"), join(project, "coverage"));
      const marker = join(run.workDir, ".memory-coverage-owner.json");
      const valuable = join(run.workDir, "valuable.txt");
      writeFileSync(valuable, "must survive lost ownership");
      unlinkSync(marker);
      releaseCoverageWork(run);
      expect(readFileSync(valuable, "utf-8")).toBe("must survive lost ownership");
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
