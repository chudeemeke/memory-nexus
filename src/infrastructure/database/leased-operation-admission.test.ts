import { expect, it, mock } from "bun:test";
import { join } from "node:path";
import { renameSync, mkdirSync, symlinkSync, realpathSync, lstatSync } from "node:fs";
import type { OperationLease } from "../../domain/ports/operation-admission.js";
import { createSourceOperationAdmission } from "./source-operation-admission.js";
import { LeasedOperationAdmission } from "./leased-operation-admission.js";
import { createOwnedTestDirectory } from "../../../tests/helpers/owned-test-directory.js";

it("admits explicit children across factories while denying implicit and parallel sibling work", async () => {
  const storage = createOwnedTestDirectory("memory-lease-");
  try {
    const log = join(storage.dir, "events-synthetic.jsonl");
    const first = createSourceOperationAdmission(log), second = createSourceOperationAdmission(log);
    let retained: OperationLease | undefined;
    expect(await first.run(async root => {
      expect(typeof root).toBe("object");
      retained = root;
      const denied = mock();
      await expect(second.run(denied)).rejects.toThrow("busy");
      expect(denied).not.toHaveBeenCalled();
      expect(await second.run(async child => {
        expect(child).not.toBe(root);
        await expect(first.run(denied, root)).rejects.toThrow("child");
        expect(denied).not.toHaveBeenCalled();
        return first.run(async grandchild => {
          expect(grandchild).not.toBe(child);
          return "nested";
        }, child);
      }, root)).toBe("nested");
      return second.run(async () => "next sibling", root);
    })).toBe("next sibling");
    const expired = mock();
    await expect(second.run(expired, retained)).rejects.toThrow("expired");
    expect(expired).not.toHaveBeenCalled();
    expect(await first.run(async () => "fresh")).toBe("fresh");
  } finally { storage.cleanup(); }
});

it("rejects wrong-source, copied and forged leases before callback entry", async () => {
  const storage = createOwnedTestDirectory("memory-lease-authority-");
  try {
    const first = createSourceOperationAdmission(join(storage.dir, "first", "events-a.jsonl"));
    const other = createSourceOperationAdmission(join(storage.dir, "other", "events-b.jsonl"));
    const denied = mock();
    await first.run(async lease => {
      expect(Object.isFrozen(lease)).toBe(true);
      await expect(other.run(denied, lease)).rejects.toThrow("source authority");
      for (const forged of [{}, { ...lease }, Object.create(lease), JSON.parse(JSON.stringify(lease)), null, "lease"]) {
        await expect(first.run(denied, forged as OperationLease)).rejects.toThrow("Invalid operation lease");
      }
      expect(denied).not.toHaveBeenCalled();
    });
    expect(await other.run(async () => "independent")).toBe("independent");
  } finally { storage.cleanup(); }
});

it("refuses leases issued by a different wrapper with the same identity but no source reservation", async () => {
  const storage = createOwnedTestDirectory("memory-lease-issuer-");
  try {
    const admission = createSourceOperationAdmission(join(storage.dir, "events-a.jsonl"));
    const root = realpathSync(storage.dir), rootKey = process.platform === "win32" ? root.toLowerCase() : root;
    const identities = [root, join(root, ".memory-local"), join(root, ".memory-local", "admission.sqlite")]
      .flatMap(path => { const stat = lstatSync(path, { bigint: true }); return [stat.dev.toString(), stat.ino.toString()]; });
    const unrelated = new LeasedOperationAdmission({ run: operation => operation() }, JSON.stringify([rootKey, ...identities]), () => {});
    const denied = mock();
    await admission.run(async () => {
      await unrelated.run(async lease => {
        await expect(admission.run(denied, lease)).rejects.toThrow("Invalid operation lease");
        expect(denied).not.toHaveBeenCalled();
      });
    });
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { storage.cleanup(); }
});

it("generic scopes reject unknown capabilities without invoking their callback", async () => {
  const storage = createOwnedTestDirectory("memory-lease-generic-");
  try {
    const backend = createSourceOperationAdmission(join(storage.dir, "events-a.jsonl"));
    const admission = new LeasedOperationAdmission(backend, "synthetic generic authority", () => {});
    const denied = mock();
    await expect(admission.run(denied, {} as OperationLease)).rejects.toThrow("Invalid operation lease");
    expect(denied).not.toHaveBeenCalled();
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { storage.cleanup(); }
});

it("shares a source lease through aliases and rejects alias replacement before nested work and completion", async () => {
  const storage = createOwnedTestDirectory("memory-lease-alias-");
  try {
    const root = join(storage.dir, "events"), alias = join(storage.dir, "alias"), moved = join(storage.dir, "retained"), other = join(storage.dir, "other");
    const linkType = process.platform === "win32" ? "junction" : "dir";
    mkdirSync(root); mkdirSync(other); symlinkSync(root, alias, linkType);
    const first = createSourceOperationAdmission(join(alias, "events-a.jsonl"));
    const same = createSourceOperationAdmission(join(root, "events-b.jsonl"));
    await first.run(async lease => { expect(await same.run(async () => "same", lease)).toBe("same"); });
    const denied = mock();
    await expect(first.run(async lease => {
      renameSync(alias, moved); symlinkSync(other, alias, linkType);
      await expect(first.run(denied, lease)).rejects.toThrow("alias changed");
      expect(denied).not.toHaveBeenCalled();
    })).rejects.toThrow("alias changed");
  } finally { storage.cleanup(); }
});

it("retains a caught child failure in the outer operation and releases for a fresh attempt", async () => {
  const storage = createOwnedTestDirectory("memory-lease-caught-");
  const failure = Error("synthetic child failure");
  try {
    const admission = createSourceOperationAdmission(join(storage.dir, "events-a.jsonl"));
    await expect(admission.run(async root => {
      await expect(admission.run(async () => { throw failure; }, root)).rejects.toBe(failure);
      return "cannot hide child failure";
    })).rejects.toBe(failure);
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { storage.cleanup(); }
});

it("retains nested operation and post-operation alias validation failures together", async () => {
  const storage = createOwnedTestDirectory("memory-lease-validation-");
  const primary = Error("synthetic nested failure");
  try {
    const root = join(storage.dir, "events"), alias = join(storage.dir, "alias"), other = join(storage.dir, "other");
    const linkType = process.platform === "win32" ? "junction" : "dir";
    const admission = createSourceOperationAdmission(join(root, "events-a.jsonl"));
    mkdirSync(other); symlinkSync(root, alias, linkType);
    const nested = createSourceOperationAdmission(join(alias, "events-b.jsonl"));
    const failure = await admission.run(lease => nested.run(async () => {
      renameSync(alias, join(storage.dir, "retained")); symlinkSync(other, alias, linkType);
      throw primary;
    }, lease)).catch(error => error) as AggregateError;
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toContain(primary);
    expect(failure.errors.some(error => error.message.includes("alias changed"))).toBe(true);
    expect(failure.errors.length).toBe(2);
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { storage.cleanup(); }
});

it("retains outer and detached child failures while draining before release", async () => {
  const storage = createOwnedTestDirectory("memory-lease-compound-");
  const outerFailure = Error("synthetic outer failure"), childFailure = Error("synthetic child failure");
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let outcome: Promise<unknown> | undefined;
  try {
    const admission = createSourceOperationAdmission(join(storage.dir, "events-a.jsonl"));
    outcome = admission.run(async root => {
      void admission.run(async () => { await barrier; throw childFailure; }, root);
      throw outerFailure;
    }).catch(error => error);
    await Bun.sleep(0);
    await expect(admission.run(mock())).rejects.toThrow("busy");
    release();
    const failure = await outcome as AggregateError;
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors).toContain(outerFailure);
    expect(failure.errors).toContain(childFailure);
    expect(failure.errors.some(error => error.message.includes("unawaited child"))).toBe(true);
    expect(failure.errors.length).toBe(3);
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { release(); await outcome; storage.cleanup(); }
});

it("drains detached child work before release and revokes further descendants", async () => {
  const storage = createOwnedTestDirectory("memory-lease-detached-");
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let child: Promise<string> | undefined, outcome: Promise<unknown> | undefined;
  try {
    const admission = createSourceOperationAdmission(join(storage.dir, "events-synthetic.jsonl"));
    let retained: OperationLease | undefined, settled = false;
    outcome = admission.run(async root => {
      child = admission.run(async lease => { retained = lease; await barrier; return "child complete"; }, root);
      return "premature completion";
    }).then(value => { settled = true; return value; }, error => { settled = true; return error; });
    await Bun.sleep(0);
    expect(settled).toBe(false);
    const denied = mock();
    await expect(admission.run(denied)).rejects.toThrow("busy");
    await expect(admission.run(denied, retained)).rejects.toThrow("expired");
    expect(denied).not.toHaveBeenCalled();
    release();
    expect(await child).toBe("child complete");
    expect(await outcome).toBeInstanceOf(Error);
    expect((await outcome as Error).message).toContain("unawaited child");
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { release(); await child; await outcome; storage.cleanup(); }
});

it("keeps root admission until an awaited child drains its detached grandchild", async () => {
  const storage = createOwnedTestDirectory("memory-lease-grandchild-");
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let outcome: Promise<unknown> | undefined;
  try {
    const admission = createSourceOperationAdmission(join(storage.dir, "events-a.jsonl"));
    let retained: OperationLease | undefined, settled = false;
    outcome = admission.run(root => admission.run(async child => {
      void admission.run(async grandchild => { retained = grandchild; await barrier; }, child);
    }, root)).then(value => { settled = true; return value; }, error => { settled = true; return error; });
    await Bun.sleep(0);
    expect(settled).toBe(false);
    const denied = mock();
    await expect(admission.run(denied)).rejects.toThrow("busy");
    await expect(admission.run(denied, retained)).rejects.toThrow("expired");
    expect(denied).not.toHaveBeenCalled();
    release();
    expect((await outcome as Error).message).toContain("unawaited child");
    expect(await admission.run(async () => "fresh")).toBe("fresh");
  } finally { release(); await outcome; storage.cleanup(); }
});
