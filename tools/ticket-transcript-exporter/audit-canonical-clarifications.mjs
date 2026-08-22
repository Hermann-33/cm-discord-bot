import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const readJsonl = async (file) => (await readFile(file, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));

export async function auditClarifications(dataDir) {
  const clarifications = await readJson(path.join(dataDir, 'runtime-kb', 'clarifications.json'));
  const cases = await readJsonl(path.join(dataDir, 'runtime-kb', 'cases.jsonl'));
  const lookups = await readJson(path.join(dataDir, 'runtime-kb', 'dynamic-lookups.json'));
  const caseIds = new Set(cases.map((item) => item.id));
  const familyIds = new Set(cases.map((item) => item.family));
  const lookupIds = new Set([...(lookups.lookups ?? lookups).map((item) => item.id), 'users.overview.read','orders.lookup.read','orders.details.read','orders.fulfillment.read','purchase-intents.lookup.read','purchase-intents.process.status.read','aura.lookup.read']);
  const missingCaseRefs = []; const missingFamilyRefs = []; const missingLookupRefs = []; const nonDiscriminative = [];
  for (const item of clarifications) {
    for (const id of item.distinguishesCases) if (!caseIds.has(id)) missingCaseRefs.push({ clarificationId: item.id, id });
    for (const id of item.distinguishesFamilies) if (!familyIds.has(id)) missingFamilyRefs.push({ clarificationId: item.id, id });
    for (const id of item.liveLookupCanReplace) if (!lookupIds.has(id)) missingLookupRefs.push({ clarificationId: item.id, id });
    if (!item.distinguishesCases.length && !item.distinguishesFamilies.length) nonDiscriminative.push(item.id);
  }
  const audit = { schemaVersion: 1, clarificationCount: clarifications.length, families: [...new Set(clarifications.flatMap((item) => item.distinguishesFamilies))].sort(), missingCaseRefs, missingFamilyRefs, missingLookupRefs, nonDiscriminative, duplicateIds: clarifications.map((item) => item.id).filter((id, index, all) => all.indexOf(id) !== index), valid: !(missingCaseRefs.length || missingFamilyRefs.length || missingLookupRefs.length || nonDiscriminative.length) };
  await writeFile(path.join(dataDir, 'knowledge-canonical', 'Audit', 'clarification-inventory-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return audit;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf('--data-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('--data-dir is required');
  console.log(JSON.stringify(await auditClarifications(path.resolve(process.argv[index + 1])), null, 2));
}
