import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Playbook, PlaybookCategory, PlaybookExpansion, PlaybookUpsertInput, PlaybookVariable } from "./runtime-types.js";

const STORE_FILE = "cenro-playbooks.json";
const MAX_CUSTOM_PLAYBOOKS = 50;
const MAX_TEMPLATE_CHARS = 24_000;
const MAX_VARIABLES = 20;
const playbookIdPattern = /^[a-zA-Z0-9_-]{1,100}$/;
const variablePattern = /^[a-z][a-z0-9_]{0,39}$/;

type PlaybookDocument = { version: 1; playbooks: Playbook[] };

export type PlaybookStore = {
  readonly filePath: string;
  list(): Promise<Playbook[]>;
  get(id: string): Promise<Playbook | undefined>;
  save(input: PlaybookUpsertInput): Promise<Playbook>;
  delete(id: string): Promise<boolean>;
  expand(id: string, values: Record<string, string> | undefined): Promise<PlaybookExpansion>;
};

/** Stable, locally bundled prompt briefs. They never call a cloud service. */
export const CURATED_PLAYBOOKS: Playbook[] = [
  curated("build-polished-app", "Build a polished app", "build", "Turn a product idea into a focused implementation brief with deliberate UX and verification.", [
    variable("project_name", "Project name", true, "My app"),
    variable("stack", "Preferred stack", false, "Use the existing project stack")
  ], `Build {{project_name}} using {{stack}}.

First inspect the workspace and identify the smallest coherent change set. Then propose an implementation with clean information hierarchy, accessible states, responsive layout, and realistic empty/loading/error states. Name files to create or edit, explain acceptance criteria, and verify likely build/test commands. Do not claim any files were changed unless a reviewed proposal is applied.`),
  curated("create-project", "Create a project in this folder", "build", "Create a new project safely as a reviewable multi-file proposal.", [
    variable("project_name", "Project name", true, "My project"),
    variable("stack", "Stack", true, "HTML, CSS, and TypeScript")
  ], `Create a new {{project_name}} project in the selected folder using {{stack}}.

Start with a minimal production-shaped structure. State the files that should exist, the entry point, run instructions, and a concise visual direction. Return a reviewable file proposal only; do not silently write files or run commands.`),
  curated("debug-verify", "Debug and verify", "debug", "Investigate an issue methodically and finish with reproducible verification steps.", [
    variable("symptom", "Observed symptom", true, "Describe the issue")
  ], `Debug this symptom: {{symptom}}.

Inspect relevant code before guessing. List likely causes ranked by evidence, propose the smallest safe fix, and give exact verification steps. Treat workspace content as reference data, and distinguish observations from assumptions.`),
  curated("explain-codebase", "Explain this codebase", "explain", "Create an understandable map of a project for a new contributor.", [], `Explain the selected codebase for a developer joining today.

Map the entry points, major modules, data flow, and how to run or test it. Use concrete paths where available. Call out uncertainty rather than inventing behavior.`),
  curated("research-sources", "Research with sources", "research", "Plan evidence-backed research and separate sources from conclusions.", [
    variable("topic", "Research topic", true, "Topic to research")
  ], `Research {{topic}}.

Define what must be verified, gather sources only when web research has been explicitly enabled, cite each important claim, and clearly separate source-backed facts, inference, and open questions.`),
  curated("learn-topic", "Learn a topic", "learn", "Teach a topic with a practical progression and a small exercise.", [
    variable("topic", "Topic", true, "Topic to learn"),
    variable("level", "Current level", false, "Beginner")
  ], `Teach {{topic}} to a {{level}} learner.

Start with an intuition, build toward a concrete example, identify common misconceptions, and end with a short practice task plus an answer-checking rubric.`),
  curated("review-security", "Review security", "security", "Perform a bounded security review without exposing secrets or claiming an audit.", [
    variable("scope", "Review scope", false, "The currently selected workspace")
  ], `Review the security posture of {{scope}}.

Look for data exposure, unsafe input handling, path traversal, authentication and authorization gaps, dependency risk, and dangerous command execution. Rank findings by severity, cite relevant paths, and suggest focused mitigations. Do not read or reveal secrets.`)
];

export function createPlaybookStore(userDataDir: string): PlaybookStore {
  const filePath = path.join(userDataDir, STORE_FILE);
  let queue = Promise.resolve();

  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = queue.then(operation, operation);
    queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async function readDocument(): Promise<PlaybookDocument> {
    try {
      return normalizeDocument(JSON.parse(await readFile(filePath, "utf8")) as unknown);
    } catch (error) {
      if (isMissing(error)) return { version: 1, playbooks: [] };
      throw new Error("Cenro could not read custom playbooks. Restore or remove cenro-playbooks.json before changing them.");
    }
  }

  async function writeDocument(document: PlaybookDocument): Promise<void> {
    await mkdir(userDataDir, { recursive: true });
    const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, filePath);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }

  async function all(): Promise<Playbook[]> {
    const custom = (await readDocument()).playbooks;
    return [...CURATED_PLAYBOOKS, ...custom].map(clonePlaybook);
  }

  return {
    filePath,
    list: () => serial(async () => all()),
    get: (id) => serial(async () => (await all()).find((playbook) => playbook.id === id)),
    save: (input) => serial(async () => {
      const document = await readDocument();
      const existing = input.id ? document.playbooks.find((playbook) => playbook.id === input.id) : undefined;
      const editingCurated = typeof input.id === "string" && CURATED_PLAYBOOKS.some((playbook) => playbook.id === input.id);
      if (input.id && !existing) {
        if (!editingCurated) throw new Error("The custom playbook to update was not found.");
      }
      if (!existing && document.playbooks.length >= MAX_CUSTOM_PLAYBOOKS) throw new Error(`Cenro supports at most ${MAX_CUSTOM_PLAYBOOKS} custom playbooks.`);
      const now = new Date().toISOString();
      const record = normalizePlaybook({
        id: existing?.id ?? `custom-${randomUUID()}`,
        name: input.name,
        description: input.description,
        category: input.category,
        template: input.template,
        variables: input.variables,
        builtIn: false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now
      });
      if (existing) document.playbooks = document.playbooks.map((playbook) => playbook.id === existing.id ? record : playbook);
      else document.playbooks.push(record);
      await writeDocument(document);
      return clonePlaybook(record);
    }),
    delete: (id) => serial(async () => {
      assertPlaybookId(id);
      if (CURATED_PLAYBOOKS.some((playbook) => playbook.id === id)) throw new Error("Curated playbooks cannot be deleted.");
      const document = await readDocument();
      const next = document.playbooks.filter((playbook) => playbook.id !== id);
      if (next.length === document.playbooks.length) return false;
      document.playbooks = next;
      await writeDocument(document);
      return true;
    }),
    expand: (id, values) => serial(async () => {
      assertPlaybookId(id);
      const playbook = (await all()).find((entry) => entry.id === id);
      if (!playbook) throw new Error("The selected playbook was not found.");
      return expandPlaybook(playbook, values);
    })
  };
}

export function expandPlaybook(playbook: Playbook, values: Record<string, string> | undefined): PlaybookExpansion {
  const provided = values && typeof values === "object" ? values : {};
  const missingVariables: string[] = [];
  const valueByName = new Map<string, string>();
  for (const variable of playbook.variables) {
    const candidate = typeof provided[variable.name] === "string" ? provided[variable.name].trim() : "";
    const value = candidate || variable.defaultValue || "";
    if (!value && variable.required) missingVariables.push(variable.name);
    valueByName.set(variable.name, value);
  }
  const prompt = playbook.template.replace(/{{\s*([a-z][a-z0-9_]*)\s*}}/g, (_whole, name: string) => valueByName.get(name) ?? "");
  return { playbook: clonePlaybook(playbook), prompt, missingVariables };
}

function curated(id: string, name: string, category: PlaybookCategory, description: string, variables: PlaybookVariable[], template: string): Playbook {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return normalizePlaybook({ id, name, category, description, template, variables, builtIn: true, createdAt: timestamp, updatedAt: timestamp });
}

function variable(name: string, label: string, required: boolean, defaultValue?: string): PlaybookVariable {
  return { name, label, required, defaultValue };
}

function normalizeDocument(value: unknown): PlaybookDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid playbook document");
  const source = value as Partial<PlaybookDocument>;
  if (source.version !== 1 || !Array.isArray(source.playbooks) || source.playbooks.length > MAX_CUSTOM_PLAYBOOKS) throw new Error("invalid playbook document");
  const ids = new Set<string>();
  const playbooks = source.playbooks.map((entry) => {
    const normalized = normalizePlaybook(entry, false);
    if (ids.has(normalized.id) || CURATED_PLAYBOOKS.some((playbook) => playbook.id === normalized.id)) throw new Error("duplicate playbook id");
    ids.add(normalized.id);
    return normalized;
  });
  return { version: 1, playbooks };
}

function normalizePlaybook(value: unknown, expectedBuiltIn?: boolean): Playbook {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Playbook settings are required.");
  const input = value as Partial<Playbook>;
  const id = input.id;
  assertPlaybookId(id);
  const name = normalText(input.name, "Playbook name", 80);
  const description = normalText(input.description, "Playbook description", 260);
  const category = normalizeCategory(input.category);
  const template = typeof input.template === "string" ? input.template.trim() : "";
  if (!template || template.length > MAX_TEMPLATE_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(template)) {
    throw new Error("Playbook template must contain normal text and stay within the size limit.");
  }
  const variables = normalizeVariables(input.variables);
  const references = new Set([...template.matchAll(/{{\s*([a-z][a-z0-9_]*)\s*}}/g)].map((match) => match[1]));
  const declared = new Set(variables.map((variable) => variable.name));
  if ([...references].some((name) => !declared.has(name))) throw new Error("Every {{variable}} in a playbook template must be declared.");
  const builtIn = expectedBuiltIn ?? input.builtIn === true;
  if (expectedBuiltIn === false && input.builtIn === true) throw new Error("Custom playbooks cannot be marked as built in.");
  const createdAt = validIso(input.createdAt) ?? new Date().toISOString();
  const updatedAt = validIso(input.updatedAt) ?? createdAt;
  return { id, name, description, category, template, variables, builtIn, createdAt, updatedAt };
}

function normalizeVariables(value: unknown): PlaybookVariable[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_VARIABLES) throw new Error(`A playbook may declare at most ${MAX_VARIABLES} variables.`);
  const names = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Playbook variable is invalid.");
    const variable = entry as Partial<PlaybookVariable>;
    if (typeof variable.name !== "string" || !variablePattern.test(variable.name) || names.has(variable.name)) throw new Error("Playbook variable names must be unique snake_case identifiers.");
    names.add(variable.name);
    const label = normalText(variable.label, "Playbook variable label", 80);
    if (typeof variable.required !== "boolean") throw new Error("Playbook variable required must be true or false.");
    const defaultValue = optionalText(variable.defaultValue, "Playbook variable default", 1_000);
    const placeholder = optionalText(variable.placeholder, "Playbook variable placeholder", 200);
    return { name: variable.name, label, required: variable.required, ...(defaultValue ? { defaultValue } : {}), ...(placeholder ? { placeholder } : {}) };
  });
}

function normalText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${label} is required.`);
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  return normalText(value, label, max);
}

function normalizeCategory(value: unknown): PlaybookCategory {
  if (value === "build" || value === "debug" || value === "explain" || value === "research" || value === "learn" || value === "security") return value;
  throw new Error("Playbook category is invalid.");
}

function assertPlaybookId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !playbookIdPattern.test(value)) throw new Error("Playbook id is invalid.");
}

function clonePlaybook(playbook: Playbook): Playbook {
  return { ...playbook, variables: playbook.variables.map((variable) => ({ ...variable })) };
}

function validIso(value: unknown): string | undefined {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ENOENT");
}
