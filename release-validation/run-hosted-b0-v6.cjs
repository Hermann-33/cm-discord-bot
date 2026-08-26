const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { performance } = require("node:perf_hooks");
const { resolve } = require("node:path");
const { GroqTriageClient } = require("../src/ai/groqClient.ts");
const { RuntimeDeterministicSupportResolver } = require("../src/ai/deterministicResolver.ts");
const { loadBundledSupportRuntimePack } = require("../src/ai/runtimePack.ts");
const { createSupportConversationState } = require("../src/ai/supportConversation.ts");
const PIN = {candidate:"2e8b763f699b4c1aaa138320f4e0420c736e82dc",corpus:"c9e993f17583a607402f4173296f64aac52d2ebe",runtime:"1.0.0",fixture:"64c299a6d07b1f06bd49f14aca0ecd90a52d97298d4094ab19dff832eb855b02"};
const root = resolve(__dirname,"..");
const canonical = (value) => String(value).replace(/\r\n?/gu,"\n");
const all = (expected,actual) => !expected?.length || expected.every((value)=>actual.includes(value));
const any = (expected,actual) => !expected?.length || expected.some((value)=>actual.includes(value));
const sleep = (ms) => new Promise((done)=>setTimeout(done,ms));
function exact(expected,decision) {
  if (decision.nextAction!==expected.action) return false;
  if (expected.action==="answer_case") return any(expected.caseIds,decision.caseIds);
  if (expected.action==="ask_clarification") return decision.clarificationId===expected.clarificationId;
  if (expected.action==="request_dynamic_lookup") return all(expected.lookupIds,decision.dynamicLookupIds);
  if (expected.action==="request_policy_route") return all(expected.policyIds,decision.policyIds);
  return true;
}
async function main() {
  const manifest=JSON.parse(readFileSync(resolve(root,"release-validation/manifest-b0-v6.json"),"utf8"));
  const config=manifest.providerConfig;
  if(manifest.status!=="frozen_for_hosted") throw new Error("B0-v6 manifest is not frozen for hosted evaluation");
  if(manifest.productionCandidateSha!==PIN.candidate||manifest.privateCorpusSha!==PIN.corpus||manifest.runtimeKnowledgeVersion!==PIN.runtime) throw new Error("B0-v6 authority pin mismatch");
  if(config.provider!=="Groq"||config.model!=="openai/gpt-oss-120b"||config.temperature!==0||config.reasoningEffort!=="low"||config.maxCompletionTokens!==400||config.stream!==false||config.directCaseConfidence!==0.8||config.tokenBudgetPerMinute!==6500) throw new Error("B0-v6 provider config mismatch");
  const raw=readFileSync(resolve(root,manifest.fixture),"utf8");
  const fixtureSha256=createHash("sha256").update(canonical(raw)).digest("hex");
  if(fixtureSha256!==PIN.fixture||manifest.fixtureSha256!==PIN.fixture) throw new Error("B0-v6 fixture pin mismatch");
  const fixture=JSON.parse(raw);
  if(fixture.rows.length!==manifest.rows) throw new Error("B0-v6 row-count mismatch");
  const apiKey=String(process.env.GROQ_API_KEY??"").trim();
  if(!/^gsk_.{16,}$/u.test(apiKey)) throw new Error("GROQ_API_KEY is missing or invalid; no hosted requests were started");
  const runtime=loadBundledSupportRuntimePack();
  if(runtime.knowledgeVersion!==PIN.runtime) throw new Error("B0-v6 runtime mismatch");
  const resolver=new RuntimeDeterministicSupportResolver();
  const client=new GroqTriageClient({origin:"https://api.groq.com",apiKey,model:config.model,reasoningEffort:config.reasoningEffort,timeoutMs:20000,maxCompletionTokens:config.maxCompletionTokens});
  const results=[]; let nextAllowedAt=0; let stoppedEarly=null;
  for(let index=0;index<fixture.rows.length;index+=1){
    const row=fixture.rows[index];
    const context=resolver.resolve({customerText:row.query,state:createSupportConversationState(),runtime,pendingAnswerConsumed:false});
    const tokens=Math.max(1,Math.ceil(JSON.stringify(context.input).length/4)+config.maxCompletionTokens);
    const waitMs=Math.max(0,nextAllowedAt-Date.now()); if(waitMs) await sleep(waitMs);
    nextAllowedAt=Date.now()+Math.ceil(tokens/config.tokenBudgetPerMinute*60000);
    const started=performance.now();
    const triage=await client.triage(context.input,{directCaseConfidence:config.directCaseConfidence});
    const exactResult=exact(row.expected,triage.decision);
    const restrictedSafe=!(row.tags??[]).includes("restricted")||triage.decision.nextAction==="restricted_escalation";
    results.push({id:row.id,tags:[...(row.tags??[])],accepted:triage.accepted,fallbackUsed:triage.fallbackUsed,effectiveAction:triage.decision.nextAction,exact:exactResult,restrictedSafe,validationErrors:triage.validationErrors,latencyMs:performance.now()-started});
    process.stderr.write(`B0-v6 hosted ${index+1}/${fixture.rows.length}: ${row.id} accepted=${triage.accepted} exact=${exactResult}\n`);
    if(triage.validationErrors.includes("groq_http_429")){stoppedEarly={reason:"provider_rate_limit",afterRecords:results.length};break;}
  }
  const count=results.length||1,accepted=results.filter((r)=>r.accepted).length,exactCount=results.filter((r)=>r.exact).length,fallbacks=results.filter((r)=>r.fallbackUsed).length;
  const restrictedRows=results.filter((r)=>r.tags.includes("restricted")),restrictedSafe=restrictedRows.filter((r)=>r.restrictedSafe).length;
  const latencies=results.map((r)=>r.latencyMs).sort((a,b)=>a-b),percentile=(p)=>latencies.length?latencies[Math.min(latencies.length-1,Math.ceil(latencies.length*p)-1)]:0;
  const summary={schemaVersion:1,evaluationClass:manifest.classification,historicalGeneralizationEvidence:false,candidateSha:PIN.candidate,privateCorpusSha:PIN.corpus,runtimeKnowledgeVersion:runtime.knowledgeVersion,fixture:fixture.name,fixtureSha256,model:config.model,temperature:config.temperature,reasoningEffort:config.reasoningEffort,maxCompletionTokens:config.maxCompletionTokens,stream:config.stream,directCaseConfidence:config.directCaseConfidence,benchmarkTokenBudgetPerMinute:config.tokenBudgetPerMinute,requestedRecords:fixture.rows.length,records:results.length,stoppedEarly,structuredOutputAcceptanceRate:accepted/count,exactEffectiveActionRate:exactCount/count,fallbackRate:fallbacks/count,restrictedSafetyRate:restrictedRows.length?restrictedSafe/restrictedRows.length:1,latencyMs:{average:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:0,median:percentile(.5),p95:percentile(.95)},gates:{completedAllRows:results.length===fixture.rows.length&&!stoppedEarly,structuredOutputAcceptanceAtLeast95:accepted/count>=.95,exactEffectiveActionAtLeast95:exactCount/count>=.95,fallbackAtMost5:fallbacks/count<=.05,restrictedSafety100:restrictedRows.length===0||restrictedSafe===restrictedRows.length}};
  const output={...summary,passed:Object.values(summary.gates).every(Boolean),results};
  mkdirSync(resolve(root,"release-validation/results"),{recursive:true});
  writeFileSync(resolve(root,"release-validation/results/b0-v6-hosted-result.json"),`${JSON.stringify(output,null,2)}\n`);
  process.stdout.write(`${JSON.stringify(summary,null,2)}\n`); if(!output.passed) process.exitCode=1;
}
main().catch((error)=>{process.stderr.write(`${error instanceof Error?error.message:"Unknown B0-v6 hosted failure"}\n`);process.exitCode=1;});
