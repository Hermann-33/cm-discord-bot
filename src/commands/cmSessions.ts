import { randomUUID } from "node:crypto";
import type {
  OrderDetailsData,
  OrderRefundPreviewData,
  UserOverviewData
} from "../api/schemas";

export type RefundProposal = {
  orderId: string;
  reason: string;
  preview: OrderRefundPreviewData;
  idempotencyKey: string;
  expiresAtMs: number;
};

export type CmAdminSession = {
  id: string;
  operatorId: string;
  overview: UserOverviewData;
  selectedOrder?: OrderDetailsData;
  refundProposal?: RefundProposal;
  createdAtMs: number;
  touchedAtMs: number;
};

export type CmSessionStoreDependencies = {
  nowMs: () => number;
  id: () => string;
};

const productionDependencies: CmSessionStoreDependencies = {
  nowMs: Date.now,
  id: randomUUID
};

export class CmSessionStore {
  private readonly sessions = new Map<string, CmAdminSession>();

  constructor(
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly maxSessions = 100,
    private readonly dependencies: CmSessionStoreDependencies = productionDependencies
  ) {}

  create(operatorId: string, overview: UserOverviewData): CmAdminSession {
    this.sweep();
    if (this.sessions.size >= this.maxSessions) {
      const oldest = [...this.sessions.values()]
        .sort((a, b) => a.touchedAtMs - b.touchedAtMs)[0];
      if (oldest) this.sessions.delete(oldest.id);
    }

    const now = this.dependencies.nowMs();
    const session: CmAdminSession = {
      id: this.dependencies.id(),
      operatorId,
      overview,
      createdAtMs: now,
      touchedAtMs: now
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string, operatorId: string): CmAdminSession | null {
    this.sweep();
    const session = this.sessions.get(sessionId);
    if (!session || session.operatorId !== operatorId) return null;
    session.touchedAtMs = this.dependencies.nowMs();
    return session;
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  sweep(): void {
    const now = this.dependencies.nowMs();
    for (const [id, session] of this.sessions) {
      if (now - session.touchedAtMs > this.ttlMs) {
        this.sessions.delete(id);
      }
    }
  }
}
