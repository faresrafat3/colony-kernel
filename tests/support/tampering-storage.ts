/**
 * A non-conforming storage adapter for tests: reads can return a mutated
 * approval request, which the real adapter now forbids (requests are
 * content-addressed and immutable). This keeps the STALE_APPROVAL defence
 * exercised even though replacement is impossible through the conforming API.
 */
import { InMemoryColonyStorage } from "../../src/adapters/in-memory-storage.js";
import type { ApprovalRequest } from "../../src/domain/approvals/approval.js";
import type { Clock } from "../../src/ports/kernel-ports.js";

export class TamperingStorage extends InMemoryColonyStorage {
  tamper: ((request: ApprovalRequest) => ApprovalRequest) | null = null;

  constructor(clock: Clock) {
    super(clock);
  }

  override getApprovalRequest(approvalRequestId: string) {
    const result = super.getApprovalRequest(approvalRequestId);
    if (result.ok && result.value !== undefined && this.tamper !== null) {
      return { ok: true as const, value: this.tamper(result.value) };
    }
    return result;
  }
}
