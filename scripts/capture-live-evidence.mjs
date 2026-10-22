import fs from "node:fs/promises";
import path from "node:path";
import {decodeReference} from "../src/engine.js";

const base=process.env.DEMO_URL||"https://pharos-invoice-to-payment-agent.shoupeorg.workers.dev";
const out=path.resolve("public/evidence/v1.0");
const confirmation="I reviewed the recipient, amount, asset, network, and reference";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function request(url,options={},attempt=0){
  try{
    const response=await fetch(`${base}${url}`,{...options,signal:AbortSignal.timeout(30000)});
    const type=response.headers.get("content-type")||"";
    const value=type.includes("json")?await response.json():await response.text();
    if(!response.ok)throw Object.assign(new Error(value.error||`HTTP ${response.status}`),{status:response.status,value});
    return{response,value};
  }catch(error){
    if(attempt<2&&(!error.status||error.status>=500)){await wait(750*2**attempt);return request(url,options,attempt+1);}
    throw error;
  }
}

const workspace=(await request("/api/workspaces",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).value;
const headers={"content-type":"application/json","x-workspace-id":workspace.workspaceId,"x-workspace-capability":workspace.capability};
const call=(url,body)=>request(url,{method:"POST",headers,body:JSON.stringify(body)}).then(x=>x.value);
const read=file=>fs.readFile(path.resolve(file),"utf8");

await fs.mkdir(out,{recursive:true});
const formats=[
  {name:"plain-text",format:"text",invoice:await read("public/samples/plain-text-invoice.txt")},
  {name:"structured-json",format:"json",invoice:await read("public/samples/structured-invoice.json")}
];
const records=[];
for(const sample of formats){
  const extracted=await call("/api/extract",sample);
  if(extracted.status!=="READY_TO_VERIFY")throw new Error(`${sample.name} did not extract cleanly.`);
  const verified=await call("/api/verify",sample);
  if(verified.verification?.status!=="VERIFIED"||verified.verification?.chainId!==1672||verified.verification?.accountType!=="EOA")throw new Error(`${sample.name} live EOA verification failed.`);
  const prepared=await call("/api/prepare",{...sample,confirmation});
  const record=prepared.record;
  if(record.transaction?.broadcast!==false||record.transaction?.unsigned!==true)throw new Error(`${sample.name} was not explicitly unsigned.`);
  if(decodeReference(record.transaction.transaction.data)!==record.canonical.reference)throw new Error(`${sample.name} reference round-trip failed.`);
  if(BigInt(record.transaction.transaction.value).toString()!==record.canonical.amountRaw)throw new Error(`${sample.name} amount round-trip failed.`);
  const replay=await call("/api/prepare",{...sample,confirmation});
  if(!replay.replayed||replay.record.id!==record.id)throw new Error(`${sample.name} replay was not deduplicated.`);
  const tx=(await request(`/api/records/${record.id}/transaction.json`,{headers})).value;
  const markdown=(await request(`/api/records/${record.id}/summary.md`,{headers})).value;
  if(tx.transaction?.data!==record.transaction.transaction.data||!markdown.includes(record.canonical.reference)||!markdown.includes("NOT BROADCAST"))throw new Error(`${sample.name} export mismatch.`);
  const sanitized={...record};delete sanitized.workspaceId;
  await fs.writeFile(path.join(out,`${sample.name}-record.json`),JSON.stringify(sanitized,null,2)+"\n");
  await fs.writeFile(path.join(out,`${sample.name}-unsigned-transaction.json`),JSON.stringify(tx,null,2)+"\n");
  await fs.writeFile(path.join(out,`${sample.name}-summary.md`),markdown);
  records.push({name:sample.name,id:record.id,reference:record.canonical.reference,record:`/evidence/v1.0/${sample.name}-record.json`,transaction:`/evidence/v1.0/${sample.name}-unsigned-transaction.json`,summary:`/evidence/v1.0/${sample.name}-summary.md`});
}

const mismatch=await call("/api/extract",{format:"text",invoice:formats[0].invoice,expected:{amount:"0.0002",payee:"0x0000000000000000000000000000000000000001",reference:"OTHER-REF",chainId:1672}});
if(mismatch.status!=="BLOCKED"||mismatch.comparison.length!==3)throw new Error("Mismatch example did not produce three explicit mismatches.");
const missingInvoice=await read("public/samples/missing-field-invoice.txt");
const missing=await call("/api/extract",{format:"text",invoice:missingInvoice});
if(missing.status!=="BLOCKED"||!missing.issues.some(issue=>issue.code==="MISSING_PAYEE"))throw new Error("Missing-field example did not block on payee.");
await fs.writeFile(path.join(out,"mismatch-result.json"),JSON.stringify(mismatch,null,2)+"\n");
await fs.writeFile(path.join(out,"missing-field-result.json"),JSON.stringify(missing,null,2)+"\n");
const manifest={engineVersion:"invoice-to-payment/1.0.0",capturedAt:new Date().toISOString(),demoUrl:base,preparationOnly:true,transactionsBroadcast:0,records,mismatch:"/evidence/v1.0/mismatch-result.json",missing:"/evidence/v1.0/missing-field-result.json"};
await fs.writeFile(path.join(out,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify(manifest,null,2));
