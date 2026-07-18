import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { TerminalCommandOutputEvent, TerminalCommandProposal, TerminalDataEvent, TerminalExitEvent, TerminalRiskLevel, TerminalSessionInfo } from "./runtime-types.js";

type TerminalEventName = "data" | "exit" | "command-output";
type TerminalEventPayload = TerminalDataEvent | TerminalExitEvent | TerminalCommandOutputEvent;
type EventEmitter = (ownerWebContentsId: number, event: TerminalEventName, payload: TerminalEventPayload) => void;

type TerminalSession = {
  id: string;
  ownerWebContentsId: number;
  cwd: string;
  shell: string;
  process: ChildProcessWithoutNullStreams;
  outputBytes: number;
};

type PendingProposal = TerminalCommandProposal & {
  ownerWebContentsId: number;
  consumed: boolean;
};

const MAX_TERMINAL_INPUT_CHARS = 32_000;
const MAX_COMMAND_CHARS = 12_000;
const MAX_SESSION_OUTPUT_BYTES = 4_000_000;
const MAX_COMMAND_OUTPUT_BYTES = 1_000_000;
const COMMAND_TIMEOUT_MS = 5 * 60_000;
const PROPOSAL_TTL_MS = 30 * 60_000;

/**
 * A deliberately small terminal bridge for a future xterm renderer. It runs a
 * real user-owned shell, but AI commands are inert proposals until the user
 * explicitly asks to execute one. The implementation avoids `shell: true`.
 *
 * node-pty can later replace the process transport behind this interface for
 * richer ANSI/resize behaviour; the IPC contract already matches xterm's
 * write/data/resize model and does not expose Node to the renderer.
 */
export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly proposals = new Map<string, PendingProposal>();

  constructor(private readonly emit: EventEmitter) {}

  start(ownerWebContentsId: number, cwd: string): TerminalSessionInfo {
    if (!Number.isInteger(ownerWebContentsId) || ownerWebContentsId <= 0) throw new Error("Terminal owner is invalid.");
    if (!cwd) throw new Error("Choose a workspace folder before opening a terminal.");
    const launch = shellLaunch();
    const child = spawn(launch.command, launch.args, { cwd, shell: false, windowsHide: true, stdio: "pipe" });
    const session: TerminalSession = { id: randomUUID(), ownerWebContentsId, cwd, shell: launch.label, process: child, outputBytes: 0 };
    this.sessions.set(session.id, session);
    child.stdout.on("data", (chunk: Buffer) => this.forwardSessionData(session, chunk));
    child.stderr.on("data", (chunk: Buffer) => this.forwardSessionData(session, chunk));
    child.on("error", (reason) => this.forwardSessionData(session, Buffer.from(`\r\n[Cenro terminal error: ${reason.message}]\r\n`)));
    child.on("exit", (code, signal) => {
      this.sessions.delete(session.id);
      this.emit(ownerWebContentsId, "exit", { sessionId: session.id, code, signal });
    });
    return { sessionId: session.id, cwd, shell: launch.label, pty: false, workspaceScopedLaunch: true, unrestrictedShell: true };
  }

  write(ownerWebContentsId: number, sessionId: string, data: string): void {
    const session = this.requireSession(ownerWebContentsId, sessionId);
    if (typeof data !== "string" || !data || data.length > MAX_TERMINAL_INPUT_CHARS || data.includes("\0")) throw new Error("Terminal input is invalid or too large.");
    if (!session.process.stdin.writable) throw new Error("This terminal session is no longer writable.");
    session.process.stdin.write(data, "utf8");
  }

  /** Reserved for node-pty. The stream fallback cannot change terminal size. */
  resize(ownerWebContentsId: number, sessionId: string, columns: number, rows: number): { supported: boolean } {
    this.requireSession(ownerWebContentsId, sessionId);
    if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 10 || rows < 4 || columns > 1_000 || rows > 1_000) throw new Error("Terminal dimensions are invalid.");
    return { supported: false };
  }

  stop(ownerWebContentsId: number, sessionId: string): void {
    const session = this.requireSession(ownerWebContentsId, sessionId);
    session.process.kill();
  }

  createProposal(ownerWebContentsId: number, input: { command: unknown; cwd: string; reason?: unknown; riskLevel?: unknown }): TerminalCommandProposal {
    if (typeof input.command !== "string" || !input.command.trim() || input.command.length > MAX_COMMAND_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.command)) {
      throw new Error("Terminal command proposal is invalid.");
    }
    if (!input.cwd) throw new Error("A workspace terminal directory is required.");
    const now = new Date();
    const proposedRisk = riskForCommand(input.command);
    const callerRisk = input.riskLevel === "low" || input.riskLevel === "medium" || input.riskLevel === "high" ? input.riskLevel : undefined;
    const proposal: PendingProposal = {
      id: randomUUID(),
      command: input.command.trim(),
      cwd: input.cwd,
      reason: typeof input.reason === "string" && input.reason.trim() ? input.reason.replace(/\s+/g, " ").trim().slice(0, 300) : "Proposed by Cenro. Review it before running: this user-controlled PowerShell command is not OS-sandboxed and may access paths outside the workspace.",
      // A model cannot down-rank a command below the runtime's own assessment.
      riskLevel: higherRisk(proposedRisk, callerRisk),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
      userMustApprove: true,
      mayAccessOutsideWorkspace: true,
      ownerWebContentsId,
      consumed: false
    };
    this.proposals.set(proposal.id, proposal);
    return toPublicProposal(proposal);
  }

  runProposal(ownerWebContentsId: number, sessionId: string, proposalId: string): { started: true } {
    const session = this.requireSession(ownerWebContentsId, sessionId);
    const proposal = this.requireProposal(ownerWebContentsId, proposalId);
    if (proposal.consumed) throw new Error("This command proposal has already been run or rejected.");
    if (Date.parse(proposal.expiresAt) <= Date.now()) {
      this.proposals.delete(proposal.id);
      throw new Error("This command proposal expired. Ask Cenro to propose it again.");
    }
    proposal.consumed = true;
    this.runOneOffCommand(session, proposal);
    return { started: true };
  }

  rejectProposal(ownerWebContentsId: number, proposalId: string): void {
    const proposal = this.requireProposal(ownerWebContentsId, proposalId);
    proposal.consumed = true;
    this.proposals.delete(proposal.id);
  }

  disposeOwner(ownerWebContentsId: number): void {
    for (const session of this.sessions.values()) if (session.ownerWebContentsId === ownerWebContentsId) session.process.kill();
    for (const [id, proposal] of this.proposals) if (proposal.ownerWebContentsId === ownerWebContentsId) this.proposals.delete(id);
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.process.kill();
    this.sessions.clear();
    this.proposals.clear();
  }

  private forwardSessionData(session: TerminalSession, chunk: Buffer): void {
    session.outputBytes += chunk.byteLength;
    if (session.outputBytes > MAX_SESSION_OUTPUT_BYTES) {
      this.emit(session.ownerWebContentsId, "data", { sessionId: session.id, data: "\r\n[Cenro closed this terminal after 4 MB of output. Start a new terminal to continue.]\r\n" });
      session.process.kill();
      return;
    }
    this.emit(session.ownerWebContentsId, "data", { sessionId: session.id, data: chunk.toString("utf8") });
  }

  private runOneOffCommand(session: TerminalSession, proposal: PendingProposal): void {
    const launch = commandLaunch(proposal.command);
    const child = spawn(launch.command, launch.args, { cwd: proposal.cwd, shell: false, windowsHide: true, stdio: "pipe" });
    let outputBytes = 0;
    let timedOut = false;
    const forward = (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        this.emit(session.ownerWebContentsId, "command-output", { sessionId: session.id, proposalId: proposal.id, data: "\r\n[Cenro stopped command output after 1 MB.]\r\n" });
        child.kill();
        return;
      }
      this.emit(session.ownerWebContentsId, "command-output", { sessionId: session.id, proposalId: proposal.id, data: chunk.toString("utf8") });
    };
    child.stdout.on("data", forward);
    child.stderr.on("data", forward);
    child.on("error", (reason) => this.emit(session.ownerWebContentsId, "command-output", { sessionId: session.id, proposalId: proposal.id, error: reason.message, done: true }));
    child.on("exit", (code) => this.emit(session.ownerWebContentsId, "command-output", { sessionId: session.id, proposalId: proposal.id, code, done: true }));
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, COMMAND_TIMEOUT_MS);
    child.once("exit", () => {
      clearTimeout(timeout);
      if (timedOut) this.emit(session.ownerWebContentsId, "command-output", { sessionId: session.id, proposalId: proposal.id, error: "Command stopped after five minutes.", done: true });
    });
  }

  private requireSession(ownerWebContentsId: number, sessionId: string): TerminalSession {
    if (typeof sessionId !== "string") throw new Error("Terminal session id is invalid.");
    const session = this.sessions.get(sessionId);
    if (!session || session.ownerWebContentsId !== ownerWebContentsId) throw new Error("Terminal session was not found.");
    return session;
  }

  private requireProposal(ownerWebContentsId: number, proposalId: string): PendingProposal {
    if (typeof proposalId !== "string") throw new Error("Terminal command proposal id is invalid.");
    const proposal = this.proposals.get(proposalId);
    if (!proposal || proposal.ownerWebContentsId !== ownerWebContentsId) throw new Error("Terminal command proposal was not found.");
    return proposal;
  }
}

function shellLaunch(): { command: string; args: string[]; label: string } {
  if (process.platform === "win32") return { command: "powershell.exe", args: ["-NoLogo", "-NoProfile"], label: "PowerShell" };
  const command = process.env.SHELL || "/bin/sh";
  return { command, args: ["-i"], label: command };
}

function commandLaunch(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") return { command: "powershell.exe", args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command] };
  return { command: process.env.SHELL || "/bin/sh", args: ["-lc", command] };
}

function riskForCommand(command: string): TerminalRiskLevel {
  const normalized = command.toLowerCase();
  if (/\b(remove-item|del|erase|rmdir|rd|format|diskpart|bcdedit|shutdown|restart-computer|git\s+reset\s+--hard|git\s+clean|npm\s+publish|curl\b[^\n]*\|\s*(iex|sh|bash)|invoke-expression)\b/.test(normalized)) return "high";
  if (/\b(npm\s+(install|i)|pnpm\s+(add|install)|yarn\s+(add|install)|pip\s+install|winget\s+install|choco\s+install|git\s+(push|commit)|move-item|copy-item|rename-item|set-content|out-file)\b/.test(normalized)) return "medium";
  return "low";
}

function higherRisk(left: TerminalRiskLevel, right: TerminalRiskLevel | undefined): TerminalRiskLevel {
  const rank: Record<TerminalRiskLevel, number> = { low: 0, medium: 1, high: 2 };
  return right && rank[right] > rank[left] ? right : left;
}

function toPublicProposal(proposal: PendingProposal): TerminalCommandProposal {
  const { ownerWebContentsId: _owner, consumed: _consumed, ...publicProposal } = proposal;
  return { ...publicProposal, userMustApprove: true, mayAccessOutsideWorkspace: true };
}
