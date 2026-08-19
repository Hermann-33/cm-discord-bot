import { randomUUID } from "node:crypto";
import type { PurchaseIntentData } from "../api/purchaseIntents";
import type {
  AuraAdjustmentData,
  InternalIntegrationOperator,
  OrderDetailsData,
  OrderFulfillmentData,
  OrderRefundExecuteData,
  OrderRefundPreviewData,
  UserOverviewData,
  WalletAdjustmentData
} from "../api/schemas";

export type RefundProposal = {
  orderId: string;
  reason: string;
  preview: OrderRefundPreviewData;
  operator: InternalIntegrationOperator;
  idempotencyKey: string;
  expiresAtMs: number;
};

export type AuraAdjustmentProposal = {
  kind: "aura";
  targetUserId: string;
  deltaAura: number;
  reason: string;
  beforeAvailableAura: number | null;
  projectedAvailableAura: number;
  operator: InternalIntegrationOperator;
  idempotencyKey: string;
  expiresAtMs: number;
};

export type WalletAdjustmentProposal = {
  kind: "wallet";
  targetUserId: string;
  deltaCents: number;
  reason: string;
  beforeBalanceCents: number | null;
  projectedBalanceCents: number;
  currency: string;
  operator: InternalIntegrationOperator;
  idempotencyKey: string;
  expiresAtMs: number;
};

export type UserAdjustmentProposal = AuraAdjustmentProposal | WalletAdjustmentProposal;

export type CmShareView =
  | { kind: "user" }
  | { kind: "orders"; page: number }
  | { kind: "order" }
  | { kind: "purchase-intent" }
  | { kind: "fulfillment"; data: OrderFulfillmentData }
  | { kind: "refund-preview" }
  | { kind: "refund-success"; data: OrderRefundExecuteData }
  | { kind: "adjustment-preview" }
  | { kind: "adjustment-success"; adjustmentKind: "aura"; data: AuraAdjustmentData }
  | { kind: "adjustment-success"; adjustmentKind: "wallet"; data: WalletAdjustmentData };

export type CmAdminSession = {
  id: string;
  operatorId: string;
  overview: UserOverviewData;
  selectedOrder?: OrderDetailsData;
  selectedPurchaseIntent?: PurchaseIntentData;
  refundProposal?: RefundProposal;
  adjustmentProposal?: UserAdjustmentProposal;
  shareView: CmShareView;
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
      shareView: { kind: "user" },
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
