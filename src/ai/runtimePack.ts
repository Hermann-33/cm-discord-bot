import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const SUPPORT_RUNTIME_ARTIFACTS = [
  "action-routing.json",
  "aliases.json",
  "cases.json",
  "catalog.json",
  "clarifications.json",
  "dynamic-lookups.json",
  "escalations.json",
  "policies.json",
  "procedures.json",
  "product-profiles.json",
  "restricted-topics.json",
  "routing.json"
] as const;

const canonicalIdSchema = z.string().regex(/^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/);
const recordSchema = z.object({ id: canonicalIdSchema }).passthrough();
const recordArraySchema = z.array(recordSchema);
const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  knowledgeVersion: z.string().min(1).max(64),
  artifacts: z.array(z.object({
    file: z.enum(SUPPORT_RUNTIME_ARTIFACTS),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    records: z.number().int().nonnegative()
  }).strict()).length(SUPPORT_RUNTIME_ARTIFACTS.length)
}).strict();

export type SupportRuntimeRecord = z.infer<typeof recordSchema>;
export type SupportRuntimePack = {
  knowledgeVersion: string;
  cases: readonly SupportRuntimeRecord[];
  clarifications: readonly SupportRuntimeRecord[];
  dynamicLookups: readonly SupportRuntimeRecord[];
  policies: readonly SupportRuntimeRecord[];
  procedures: readonly SupportRuntimeRecord[];
  escalations: readonly SupportRuntimeRecord[];
  restrictedTopics: readonly SupportRuntimeRecord[];
  aliases: readonly Record<string, unknown>[];
  productProfiles: readonly SupportRuntimeRecord[];
  catalog: Readonly<Record<string, unknown>>;
  routing: Readonly<Record<string, unknown>>;
  actionRouting: Readonly<Record<string, unknown>>;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function readVerifiedJson(directory: string, file: typeof SUPPORT_RUNTIME_ARTIFACTS[number], expectedHash: string): unknown {
  const raw = readFileSync(resolve(directory, file), "utf8");
  if (sha256(raw) !== expectedHash) throw new Error(`Support runtime artifact integrity check failed: ${file}`);
  return JSON.parse(raw) as unknown;
}

function asObject(value: unknown, file: string): Readonly<Record<string, unknown>> {
  const parsed = z.record(z.string(), z.unknown()).safeParse(value);
  if (!parsed.success) throw new Error(`Invalid support runtime object: ${file}`);
  return parsed.data;
}

function asRecords(value: unknown, file: string): readonly SupportRuntimeRecord[] {
  const parsed = recordArraySchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid support runtime records: ${file}`);
  return parsed.data;
}

export function bundledSupportRuntimeDirectory(): string {
  return resolve(__dirname, "../../support-runtime");
}

export function loadBundledSupportRuntimePack(directory = bundledSupportRuntimeDirectory()): SupportRuntimePack {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8")));
  const hashes = new Map(manifest.artifacts.map((item) => [item.file, item.sha256] as const));
  const read = (file: typeof SUPPORT_RUNTIME_ARTIFACTS[number]) => readVerifiedJson(directory, file, hashes.get(file)!);

  return {
    knowledgeVersion: manifest.knowledgeVersion,
    actionRouting: asObject(read("action-routing.json"), "action-routing.json"),
    aliases: z.array(z.record(z.string(), z.unknown())).parse(read("aliases.json")),
    cases: asRecords(read("cases.json"), "cases.json"),
    catalog: asObject(read("catalog.json"), "catalog.json"),
    clarifications: asRecords(read("clarifications.json"), "clarifications.json"),
    dynamicLookups: asRecords(read("dynamic-lookups.json"), "dynamic-lookups.json"),
    escalations: asRecords(read("escalations.json"), "escalations.json"),
    policies: asRecords(read("policies.json"), "policies.json"),
    procedures: asRecords(read("procedures.json"), "procedures.json"),
    productProfiles: asRecords(read("product-profiles.json"), "product-profiles.json"),
    restrictedTopics: asRecords(read("restricted-topics.json"), "restricted-topics.json"),
    routing: asObject(read("routing.json"), "routing.json")
  };
}
