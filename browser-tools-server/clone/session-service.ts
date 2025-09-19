import type { Application, Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import type { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";

import type {
  CloneSessionRequest,
  CloneSessionMetadata,
  CloneSessionStatus,
  CloneProgressEvent,
  CloneProgressPhase,
  CloneSnapshotChunk,
} from "./types.js";

interface SessionRecord extends CloneSessionMetadata {
  workspacePath: string;
  request: CloneSessionRequest;
  lastProgress?: CloneProgressEvent;
}

interface FinishSessionBody {
  sessionId?: string;
  status?: CloneSessionStatus;
  message?: string;
  notes?: string;
}

export interface CloneSessionInfo extends CloneSessionMetadata {
  workspacePath: string;
  lastProgress?: CloneProgressEvent;
}

interface ProgressMessage {
  type: "clone:progress";
  event: CloneProgressEvent;
  session: CloneSessionInfo;
}

interface SnapshotMessage {
  type: "clone:snapshot";
  sessions: CloneSessionInfo[];
}

interface SnapshotState {
  writeStream: fs.WriteStream;
  expectedChunks: number;
  receivedChunks: number;
  filePath: string;
}

export class CloneSessionService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly progressServer = new WebSocketServer({ noServer: true });
  private readonly progressClients = new Set<WebSocket>();
  private readonly sessionsRoot: string;
  private readonly snapshotStates = new Map<string, SnapshotState>();

  constructor(private readonly app: Application) {
    this.sessionsRoot = path.join(os.tmpdir(), "browser-tools-clone");
    fs.mkdirSync(this.sessionsRoot, { recursive: true });
    this.registerHttpRoutes();
    this.setupWebSocketHandlers();
  }

  private registerHttpRoutes() {
    this.app.post(
      "/clone/session/start",
      async (req: Request, res: Response): Promise<void> => {
        try {
          const body = req.body as CloneSessionRequest | undefined;

          if (!body || !body.scope) {
            res.status(400).json({
              error: "Invalid session request. Expected { scope: \"page\" | \"selection\" }.",
            });
            return;
          }

          const session = await this.createSession(body);
          const serialized = this.serializeSession(session);

          // Emit initial progress event so subscribers learn about the session
          this.emitProgress(session.sessionId, {
            sessionId: session.sessionId,
            phase: "initializing",
            progress: 0,
            message: "Session initialized",
            timestamp: new Date().toISOString(),
          });

          res.status(201).json({
            session: serialized,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to create session";
          res.status(500).json({ error: message });
        }
      }
    );

    this.app.post(
      "/clone/session/finish",
      async (req: Request, res: Response): Promise<void> => {
        try {
          const body = req.body as FinishSessionBody | undefined;
          const sessionId = body?.sessionId;

          if (!sessionId) {
            res.status(400).json({ error: "Missing sessionId" });
            return;
          }

          const record = this.sessions.get(sessionId);
          if (!record) {
            res.status(404).json({ error: "Session not found" });
            return;
          }

          const nextStatus: CloneSessionStatus = body?.status || "completed";
          record.status = nextStatus;
          record.updatedAt = new Date().toISOString();
          if (body?.message) {
            record.notes = body.message;
          }
          if (body?.notes) {
            record.notes = body.notes;
          }

          await this.closeSnapshot(sessionId);

          const phase: CloneProgressPhase =
            nextStatus === "failed" ? "failed" : "completed";

          const event: CloneProgressEvent = {
            sessionId: record.sessionId,
            phase,
            progress: 1,
            message:
              phase === "failed"
                ? record.notes || "Session marked as failed"
                : record.notes || "Session completed",
            timestamp: new Date().toISOString(),
          };

          this.emitProgress(record.sessionId, event);

          res.json({ session: this.serializeSession(record) });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to finish session";
          res.status(500).json({ error: message });
        }
      }
    );

    this.app.post(
      "/clone/session/:sessionId/chunk",
      async (req: Request, res: Response): Promise<void> => {
        try {
          const sessionId = req.params.sessionId;
          const record = this.sessions.get(sessionId);

          if (!record) {
            res.status(404).json({ error: "Session not found" });
            return;
          }

          const chunk = req.body as CloneSnapshotChunk | undefined;

          if (
            !chunk ||
            typeof chunk.sequence !== "number" ||
            typeof chunk.totalChunks !== "number" ||
            typeof chunk.payload !== "string"
          ) {
            res.status(400).json({ error: "Invalid snapshot chunk payload" });
            return;
          }

          await this.appendSnapshotChunk(record, chunk);

          res.status(202).json({ status: "ok" });
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to process snapshot chunk";
          res.status(500).json({ error: message });
        }
      }
    );

    this.app.get(
      "/clone/session/:sessionId",
      (req: Request, res: Response): void => {
        const sessionId = req.params.sessionId;
        const record = this.sessions.get(sessionId);
        if (!record) {
          res.status(404).json({ error: "Session not found" });
          return;
        }
        res.json({ session: this.serializeSession(record) });
      }
    );

    this.app.get("/clone/sessions", (_req: Request, res: Response): void => {
      res.json({ sessions: this.getSerializedSessions() });
    });
  }

  private setupWebSocketHandlers() {
    this.progressServer.on("connection", (socket: WebSocket) => {
      this.progressClients.add(socket);

      // Send current snapshot immediately
      const snapshot: SnapshotMessage = {
        type: "clone:snapshot",
        sessions: this.getSerializedSessions(),
      };
      try {
        socket.send(JSON.stringify(snapshot));
      } catch (error) {
        console.error("Failed to send snapshot to progress client", error);
      }

      socket.on("close", () => {
        this.progressClients.delete(socket);
      });

      socket.on("error", (error) => {
        console.error("Clone progress socket error", error);
      });
    });
  }

  public attachToServer(server: HttpServer) {
    server.on("upgrade", (request, socket, head) => {
      try {
        const { url } = request;
        if (!url) {
          return;
        }
        const parsed = new URL(url, "http://localhost");
        if (parsed.pathname !== "/clone/progress") {
          return;
        }

        this.progressServer.handleUpgrade(request, socket, head, (ws) => {
          this.progressServer.emit("connection", ws, request);
        });
      } catch (error) {
        console.error("Failed to handle clone progress upgrade", error);
        socket.destroy();
      }
    });
  }

  public async shutdown(): Promise<void> {
    const snapshotSessionIds = Array.from(this.snapshotStates.keys());
    for (const sessionId of snapshotSessionIds) {
      try {
        await this.closeSnapshot(sessionId);
      } catch (error) {
        console.error("Failed to close snapshot writer", error);
      }
    }

    for (const client of this.progressClients) {
      try {
        client.close(1001, "Server shutting down");
      } catch (error) {
        console.error("Failed to close progress client", error);
      }
    }
    this.progressClients.clear();

    await new Promise<void>((resolve) => {
      this.progressServer.close(() => resolve());
    });
  }

  public recordProgress(event: CloneProgressEvent) {
    this.emitProgress(event.sessionId, event);
  }

  public getSession(sessionId: string): CloneSessionInfo | undefined {
    const record = this.sessions.get(sessionId);
    return record ? this.serializeSession(record) : undefined;
  }

  private async createSession(
    request: CloneSessionRequest
  ): Promise<SessionRecord> {
    const now = new Date().toISOString();
    const sessionId = randomUUID();

    const sessionDir = path.join(this.sessionsRoot, sessionId);
    await fs.promises.mkdir(sessionDir, { recursive: true });

    const record: SessionRecord = {
      sessionId,
      scope: request.scope,
      status: "initializing",
      startedAt: now,
      updatedAt: now,
      targetSelector: request.targetSelector,
      notes: request.includeInteractions
        ? "Interactions requested"
        : undefined,
      workspacePath: sessionDir,
      request,
    };

    this.sessions.set(sessionId, record);
    return record;
  }

  private async appendSnapshotChunk(
    record: SessionRecord,
    chunk: CloneSnapshotChunk
  ) {
    let state = this.snapshotStates.get(record.sessionId);

    if (!state) {
      const filePath = path.join(record.workspacePath, "dom-snapshot.json");
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const writeStream = fs.createWriteStream(filePath, { flags: "w" });
      state = {
        writeStream,
        expectedChunks: chunk.totalChunks,
        receivedChunks: 0,
        filePath,
      };
      this.snapshotStates.set(record.sessionId, state);
    }

    if (state.expectedChunks !== chunk.totalChunks) {
      state.expectedChunks = chunk.totalChunks;
    }

    if (chunk.sequence !== state.receivedChunks) {
      throw new Error(
        `Unexpected chunk sequence for session ${record.sessionId}: expected ${state.receivedChunks}, received ${chunk.sequence}`
      );
    }

    const encoding = chunk.payloadFormat === "base64" ? "base64" : "utf8";
    const writeResult = state.writeStream.write(chunk.payload, encoding);

    if (!writeResult) {
      await new Promise<void>((resolve) =>
        state?.writeStream.once("drain", resolve)
      );
    }

    state.receivedChunks += 1;
    record.status = "capturing";

    const progress =
      state.expectedChunks > 0
        ? Math.min(state.receivedChunks / state.expectedChunks, 1)
        : 1;

    this.recordProgress({
      sessionId: record.sessionId,
      phase: "capturingDom",
      progress,
      message: `Captured ${state.receivedChunks}/${state.expectedChunks} DOM chunks`,
      timestamp: new Date().toISOString(),
    });

    if (state.receivedChunks >= state.expectedChunks) {
      await this.closeSnapshot(record.sessionId);
    }
  }

  private async closeSnapshot(sessionId: string) {
    const state = this.snapshotStates.get(sessionId);
    if (!state) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      state.writeStream.end((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    this.snapshotStates.delete(sessionId);
  }

  private emitProgress(sessionId: string, event: CloneProgressEvent) {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }

    record.lastProgress = event;
    record.updatedAt = event.timestamp;

    const message: ProgressMessage = {
      type: "clone:progress",
      event,
      session: this.serializeSession(record),
    };

    const payload = JSON.stringify(message);

    for (const client of this.progressClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(payload);
        } catch (error) {
          console.error("Failed to send progress event", error);
        }
      }
    }
  }

  private serializeSession(record: SessionRecord): CloneSessionInfo {
    return {
      sessionId: record.sessionId,
      scope: record.scope,
      status: record.status,
      startedAt: record.startedAt,
      updatedAt: record.updatedAt,
      targetSelector: record.targetSelector,
      notes: record.notes,
      workspacePath: record.workspacePath,
      lastProgress: record.lastProgress,
    };
  }

  private getSerializedSessions(): CloneSessionInfo[] {
    return Array.from(this.sessions.values()).map((session) =>
      this.serializeSession(session)
    );
  }
}
