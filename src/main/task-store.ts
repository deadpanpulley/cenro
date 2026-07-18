import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

/** The route selected for a task. */
export type TaskMode = "local" | "smart" | "cloud";

/** The Cenro workflow a task belongs to. */
export type TaskArea = "research" | "learn" | "build";

/** Accepted on writes so UI labels can be passed without a cast. */
export type TaskModeInput = TaskMode | Capitalize<TaskMode>;
export type TaskAreaInput = TaskArea | Capitalize<TaskArea>;

export type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type TaskSourceKind = "workspace" | "web" | "user" | "system" | "model" | "artifact";
export type TaskActionStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type TaskMetadata = Record<string, JsonValue>;

/** A piece of evidence or context included in a task receipt. */
export interface TaskSource {
  id: string;
  kind: TaskSourceKind;
  label: string;
  uri?: string;
  excerpt?: string;
  capturedAt?: string;
  metadata?: TaskMetadata;
}

/** An inspectable step performed while a task ran. */
export interface TaskAction {
  id: string;
  type: string;
  label: string;
  status: TaskActionStatus;
  startedAt?: string;
  completedAt?: string;
  detail?: string;
  metadata?: TaskMetadata;
}

/** A durable task and its replayable receipt. Dates are ISO-8601 UTC strings. */
export interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  mode: TaskMode;
  area: TaskArea;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  model?: string;
  response?: string;
  error?: string;
  workspacePath?: string;
  sources: TaskSource[];
  actions: TaskAction[];
  metadata?: TaskMetadata;
}

/**
 * Convenient write shape. `save` fills in omitted workflow fields and dates,
 * and generates an id when one is not supplied.
 */
export type TaskRecordInput = Omit<
  TaskRecord,
  "id" | "mode" | "area" | "status" | "createdAt" | "updatedAt" | "sources" | "actions"
> & Partial<Pick<TaskRecord, "id" | "status" | "createdAt" | "updatedAt" | "sources" | "actions">> & {
  mode?: TaskModeInput;
  area?: TaskAreaInput;
};

export interface TaskStore {
  /** Absolute path of the JSON file maintained by this store. */
  readonly filePath: string;
  /** Lists newest records first. The result is capped at 200 records. */
  list(limit?: number): Promise<TaskRecord[]>;
  get(id: string): Promise<TaskRecord | undefined>;
  /** Inserts or replaces a record with the same id. */
  save(record: TaskRecord | TaskRecordInput): Promise<TaskRecord>;
  delete(id: string): Promise<boolean>;
  clear(): Promise<void>;
}

const STORE_FILE = "cenro-tasks.json";
const LEGACY_STORE_FILE = "relay-tasks.json";
const STORE_VERSION = 1;
const MAX_TASKS = 200;
const MAX_SOURCES_PER_TASK = 100;
const MAX_ACTIONS_PER_TASK = 200;
const MAX_TEXT_LENGTH = 200_000;
const MAX_METADATA_DEPTH = 8;
const MAX_METADATA_KEYS = 100;
const MAX_METADATA_ITEMS = 200;

type StoredDocument = {
  version: number;
  tasks: TaskRecord[];
};

type UnknownRecord = Record<string, unknown>;

/**
 * Creates a local, append-or-replace task receipt store. Operations issued to
 * one store instance are serialized so a read never observes its own partial
 * write. Data is written to a sibling temporary file, then renamed into place.
 */
export function createTaskStore(userDataDir: string): TaskStore {
  const directory = path.resolve(requireDirectory(userDataDir));
  const filePath = path.join(directory, STORE_FILE);
  const legacyFilePath = path.join(directory, LEGACY_STORE_FILE);
  let queue: Promise<void> = Promise.resolve();

  const readCurrentTasks = async () => (await fileExists(filePath)) ? readTasks(filePath) : readTasks(legacyFilePath);

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    filePath,

    list(limit?: number): Promise<TaskRecord[]> {
      return exclusive(async () => {
        const tasks = await readCurrentTasks();
        return tasks.slice(0, normalizeLimit(limit)).map(copyTask);
      });
    },

    get(id: string): Promise<TaskRecord | undefined> {
      return exclusive(async () => {
        const normalizedId = normalizeId(id, false);
        if (!normalizedId) return undefined;
        const record = (await readCurrentTasks()).find((task) => task.id === normalizedId);
        return record ? copyTask(record) : undefined;
      });
    },

    save(record: TaskRecord | TaskRecordInput): Promise<TaskRecord> {
      return exclusive(async () => {
        const now = new Date().toISOString();
        const normalized = normalizeTask(record, { now, generateId: true, touchUpdatedAt: true });
        const existing = await readCurrentTasks();
        const tasks = sortTasks([normalized, ...existing.filter((task) => task.id !== normalized.id)]).slice(0, MAX_TASKS);
        await writeTasks(filePath, tasks);
        return copyTask(normalized);
      });
    },

    delete(id: string): Promise<boolean> {
      return exclusive(async () => {
        const normalizedId = normalizeId(id, false);
        if (!normalizedId) return false;
        const tasks = await readCurrentTasks();
        const next = tasks.filter((task) => task.id !== normalizedId);
        if (next.length === tasks.length) return false;
        await writeTasks(filePath, next);
        return true;
      });
    },

    clear(): Promise<void> {
      return exclusive(async () => writeTasks(filePath, []));
    }
  };
}

async function readTasks(filePath: string): Promise<TaskRecord[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return [];
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    // A damaged receipt file must not stop Cenro from starting. The next
    // successful save replaces it with a fresh, valid document.
    return [];
  }

  const candidates = Array.isArray(parsed)
    ? parsed // Accept the earliest array-only format if one ever existed.
    : isRecord(parsed) && Array.isArray(parsed.tasks)
      ? parsed.tasks
      : [];
  const fallbackTime = new Date(0).toISOString();
  const tasks: TaskRecord[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    try {
      const task = normalizeTask(candidate, { now: fallbackTime, generateId: false, touchUpdatedAt: false });
      if (!seen.has(task.id)) {
        seen.add(task.id);
        tasks.push(task);
      }
    } catch {
      // Ignore individual malformed records while preserving healthy history.
    }
  }
  return sortTasks(tasks).slice(0, MAX_TASKS);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function writeTasks(filePath: string, tasks: TaskRecord[]): Promise<void> {
  const document: StoredDocument = { version: STORE_VERSION, tasks: sortTasks(tasks).slice(0, MAX_TASKS) };
  const payload = `${JSON.stringify(document, null, 2)}\n`;
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;

  await mkdir(directory, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, "w", 0o600);
    await handle.writeFile(payload, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, filePath);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function normalizeTask(value: unknown, options: { now: string; generateId: boolean; touchUpdatedAt: boolean }): TaskRecord {
  if (!isRecord(value)) throw new TypeError("Task record must be an object.");

  const prompt = normalizeRequiredText(value.prompt, "Task prompt", 16_000);
  const id = normalizeId(value.id, options.generateId);
  if (!id) throw new TypeError("Task record id is required.");
  const title = normalizeOptionalText(value.title, 500) ?? prompt.slice(0, 500);
  const response = normalizeOptionalText(value.response, MAX_TEXT_LENGTH);
  const error = normalizeOptionalText(value.error, 20_000);
  const completedAt = normalizeOptionalTimestamp(value.completedAt);
  const status = normalizeStatus(value.status, response, error, completedAt);
  const createdAt = normalizeTimestamp(value.createdAt, options.now);
  const updatedAt = options.touchUpdatedAt ? options.now : normalizeTimestamp(value.updatedAt, createdAt);

  return compactObject({
    id,
    title,
    prompt,
    mode: normalizeMode(value.mode),
    area: normalizeArea(value.area),
    status,
    createdAt,
    updatedAt,
    completedAt,
    model: normalizeOptionalText(value.model, 200),
    response,
    error,
    workspacePath: normalizeOptionalText(value.workspacePath, 4_000),
    sources: normalizeSources(value.sources),
    actions: normalizeActions(value.actions),
    metadata: normalizeMetadata(value.metadata)
  }) as TaskRecord;
}

function normalizeSources(value: unknown): TaskSource[] {
  if (!Array.isArray(value)) return [];
  const sources: TaskSource[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length && sources.length < MAX_SOURCES_PER_TASK; index += 1) {
    const candidate = value[index];
    if (!isRecord(candidate)) continue;
    const kind = normalizeSourceKind(candidate.kind);
    const id = normalizeId(candidate.id, false) ?? `${kind}-${index + 1}`;
    if (seen.has(id)) continue;
    const uri = normalizeOptionalText(candidate.uri, 4_000);
    const label = normalizeOptionalText(candidate.label, 1_000) ?? uri ?? kind;
    seen.add(id);
    sources.push(compactObject({
      id,
      kind,
      label,
      uri,
      excerpt: normalizeOptionalText(candidate.excerpt, 20_000),
      capturedAt: normalizeOptionalTimestamp(candidate.capturedAt),
      metadata: normalizeMetadata(candidate.metadata)
    }) as TaskSource);
  }
  return sources;
}

function normalizeActions(value: unknown): TaskAction[] {
  if (!Array.isArray(value)) return [];
  const actions: TaskAction[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length && actions.length < MAX_ACTIONS_PER_TASK; index += 1) {
    const candidate = value[index];
    if (!isRecord(candidate)) continue;
    const type = normalizeOptionalText(candidate.type, 200) ?? "unknown";
    const id = normalizeId(candidate.id, false) ?? `${type}-${index + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    actions.push(compactObject({
      id,
      type,
      label: normalizeOptionalText(candidate.label, 1_000) ?? type,
      status: normalizeActionStatus(candidate.status),
      startedAt: normalizeOptionalTimestamp(candidate.startedAt),
      completedAt: normalizeOptionalTimestamp(candidate.completedAt),
      detail: normalizeOptionalText(candidate.detail, 20_000),
      metadata: normalizeMetadata(candidate.metadata)
    }) as TaskAction);
  }
  return actions;
}

function normalizeMode(value: unknown): TaskMode {
  const mode = normalizeOptionalText(value, 20)?.toLowerCase();
  return mode === "local" || mode === "cloud" || mode === "smart" ? mode : "smart";
}

function normalizeArea(value: unknown): TaskArea {
  const area = normalizeOptionalText(value, 20)?.toLowerCase();
  return area === "learn" || area === "build" || area === "research" ? area : "research";
}

function normalizeStatus(value: unknown, response?: string, error?: string, completedAt?: string): TaskStatus {
  const status = normalizeOptionalText(value, 20)?.toLowerCase();
  if (status === "queued" || status === "running" || status === "completed" || status === "failed" || status === "cancelled") return status;
  if (error) return "failed";
  if (response || completedAt) return "completed";
  return "queued";
}

function normalizeSourceKind(value: unknown): TaskSourceKind {
  const kind = normalizeOptionalText(value, 30)?.toLowerCase();
  return kind === "workspace" || kind === "web" || kind === "user" || kind === "system" || kind === "model" || kind === "artifact"
    ? kind
    : "system";
}

function normalizeActionStatus(value: unknown): TaskActionStatus {
  const status = normalizeOptionalText(value, 20)?.toLowerCase();
  return status === "pending" || status === "running" || status === "completed" || status === "failed" || status === "skipped"
    ? status
    : "completed";
}

function normalizeId(value: unknown, generateWhenMissing: boolean): string | undefined {
  const id = normalizeOptionalText(value, 200);
  if (id) return id;
  return generateWhenMissing ? randomUUID() : undefined;
}

function normalizeRequiredText(value: unknown, name: string, maxLength: number): string {
  const text = normalizeOptionalText(value, maxLength);
  if (!text) throw new TypeError(`${name} is required.`);
  return text;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : undefined;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  return normalizeOptionalTimestamp(value) ?? fallback;
}

function normalizeOptionalTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeMetadata(value: unknown): TaskMetadata | undefined {
  if (!isRecord(value)) return undefined;
  const normalized = normalizeJsonValue(value, 0, new WeakSet<object>());
  return isRecord(normalized) ? normalized as TaskMetadata : undefined;
}

function normalizeJsonValue(value: unknown, depth: number, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (depth >= MAX_METADATA_DEPTH || typeof value !== "object") return undefined;
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value.slice(0, MAX_METADATA_ITEMS)) {
      const normalized = normalizeJsonValue(item, depth + 1, seen);
      if (normalized !== undefined) result.push(normalized);
    }
    return result;
  }

  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_METADATA_KEYS)) {
    const normalized = normalizeJsonValue(item, depth + 1, seen);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    if (updated !== 0) return updated;
    const created = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return created !== 0 ? created : right.id.localeCompare(left.id);
  });
}

function copyTask(task: TaskRecord): TaskRecord {
  return normalizeTask(task, { now: task.updatedAt, generateId: false, touchUpdatedAt: false });
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return MAX_TASKS;
  if (!Number.isFinite(value) || value < 0) throw new RangeError("Task list limit must be a non-negative finite number.");
  return Math.min(MAX_TASKS, Math.floor(value));
}

function requireDirectory(value: string): string {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("A user data directory is required.");
  return value;
}

function compactObject<T extends object>(value: T): T {
  for (const key of Object.keys(value) as Array<keyof T>) {
    if (value[key] === undefined) delete value[key];
  }
  return value;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}
