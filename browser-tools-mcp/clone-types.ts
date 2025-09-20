export type CloneScope = "page" | "selection";

export type CloneSessionStatus =
  | "pending"
  | "initializing"
  | "capturing"
  | "processing"
  | "completed"
  | "failed";

export type CloneProgressPhase =
  | "initializing"
  | "capturingDom"
  | "capturingStyles"
  | "capturingAssets"
  | "capturingInteractions"
  | "capturingAnimations"
  | "capturingResponsiveStates"
  | "processing"
  | "generating"
  | "completed"
  | "failed";

export type CloneSnapshotPayloadType =
  | "dom"
  | "styles"
  | "assets"
  | "interactions"
  | "animations"
  | "responsive";

export type CloneSnapshotPayloadFormat = "json" | "base64";

export interface CloneSessionRequest {
  scope: CloneScope;
  targetSelector?: string;
  includeInteractions?: boolean;
  includeResponsiveStates?: boolean;
}

export interface CloneSessionMetadata {
  sessionId: string;
  scope: CloneScope;
  status: CloneSessionStatus;
  startedAt: string;
  updatedAt: string;
  targetSelector?: string;
  notes?: string;
}

export interface CloneSnapshotChunk {
  sessionId: string;
  chunkId: string;
  sequence: number;
  totalChunks: number;
  payloadType: CloneSnapshotPayloadType;
  payloadFormat: CloneSnapshotPayloadFormat;
  payload: string;
}

export interface CloneProgressEvent {
  sessionId: string;
  phase: CloneProgressPhase;
  progress: number;
  message?: string;
  timestamp: string;
}

export interface CloneSessionSummary {
  session: CloneSessionMetadata;
  receivedChunks: number;
  expectedChunks?: number;
  lastProgress?: CloneProgressEvent;
}

export interface CloneToolResult {
  sessionId: string;
  scope: CloneScope;
  status: CloneSessionStatus;
  message: string;
}
