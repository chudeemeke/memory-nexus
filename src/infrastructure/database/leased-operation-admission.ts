import type { OperationAdmission, OperationLease, LeasedOperationAdmission as AdmissionPort } from "../../domain/ports/operation-admission.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

interface Frame {
  authority: string;
  open: boolean;
  parent: Frame | undefined;
  child?: Frame;
  failures: unknown[];
  done: Promise<void>;
  finish: () => void;
}
const frames = new WeakMap<OperationLease, Frame>();

/** Trusted composition supplies the canonical authority identity and validator. */
export class LeasedOperationAdmission implements AdmissionPort {
  constructor(private readonly backend: OperationAdmission, private readonly authority: string, private readonly validate: () => void) {}

  run<T>(operation: (lease: OperationLease) => Promise<T>, parent?: OperationLease): Promise<T> {
    try {
      this.validate();
      if (parent !== undefined) {
        const owner = frames.get(parent);
        if (!owner || owner.authority !== this.authority) throw new Error("Invalid operation lease for this source authority");
        for (let ancestor: Frame | undefined = owner; ancestor; ancestor = ancestor.parent) {
          if (!ancestor.open) throw new Error("Operation lease expired");
        }
        if (owner.child) throw new Error("Operation lease already has an active child");
        const child = this.createFrame(owner);
        owner.child = child;
        return this.start(child, operation);
      }
      return this.backend.run(() => this.start(this.createFrame(), operation));
    } catch (error) { return Promise.reject(error); }
  }

  private createFrame(parent?: Frame): Frame {
    let finish!: () => void;
    const done = new Promise<void>(resolve => { finish = resolve; });
    return { authority: this.authority, open: true, parent, failures: [], done, finish };
  }

  private start<T>(frame: Frame, operation: (lease: OperationLease) => Promise<T>): Promise<T> {
    const pending = this.execute(frame, operation);
    // Observe every child, even when its caller forgets to await the result.
    void pending.then(() => this.finish(frame), error => {
      if (frame.parent) frame.parent.failures.push(error);
      this.finish(frame);
    });
    return pending;
  }

  private finish(frame: Frame): void {
    if (frame.parent) delete frame.parent.child;
    frame.finish();
  }

  private async execute<T>(frame: Frame, operation: (lease: OperationLease) => Promise<T>): Promise<T> {
    const lease = Object.freeze(Object.create(null)) as OperationLease;
    frames.set(lease, frame);
    let result: T | undefined;
    try { result = await operation(lease); } catch (error) { frame.failures.push(error); }
    frame.open = false;
    if (frame.child) {
      frame.failures.push(new Error("Operation callback completed with unawaited child work"));
      await frame.child.done;
    }
    try { this.validate(); } catch (error) { frame.failures.push(error); }
    const failures = [...new Set(frame.failures)];
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `Operation scope and child work failed: ${failures.map(unknownErrorMessage).join("; ")}`);
    return result as T;
  }
}
