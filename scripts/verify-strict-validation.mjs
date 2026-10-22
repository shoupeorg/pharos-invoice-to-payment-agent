import fs from "node:fs/promises";

const base=process.env.DEMO_URL||"https://pharos-invoice-to-payment-agent.shoupeorg.workers.dev";
const confirmation="I reviewed the recipient, amount, asset, network, and reference";
const request=async(path,options={})=>{const response=await fetch(`${base}${path}`,{...options,signal:AbortSignal.timeout(30000)});const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error||`HTTP ${response.status}`),{value});return value;};
const workspace=await request("/api/workspaces",{method:"POST",headers:{"content-type":"application/json"},body:"{}"});
const headers={"content-type":"application/json","x-workspace-id":workspace.workspaceId,"x-workspace-capability":workspace.capability};
const post=(path,body)=>request(path,{method:"POST",headers,body:JSON.stringify(body)});
const decode=data=>Buffer.from(data.slice(2),"hex").toString("utf8");
const samples=[
  {name:"plain-text",format:"text",invoice:await fs.readFile("public/samples/plain-text-invoice.txt","utf8")},
  {name:"structured-json",format:"json",invoice:await fs.readFile("public/samples/structured-invoice.json","utf8")}
];

const results=[];
for(const sample of samples){
  const extracted=await post("/api/extract",sample);
  if(extracted.status!=="READY_TO_VERIFY")throw new Error(`${sample.name} extraction failed: ${JSON.stringify(extracted)}`);
  const verified=await post("/api/verify",sample);
  if(verified.verification?.status!=="VERIFIED")throw new Error(`${sample.name} verification failed.`);
  const prepared=await post("/api/prepare",{...sample,confirmation});
  const c=prepared.record.canonical,t=prepared.record.transaction.transaction;
  if(t.to!==c.payee||BigInt(t.value).toString()!==c.amountRaw||t.chainId!==1672||decode(t.data)!==`PHAROS-INVOICE/1:${c.reference}`||prepared.record.transaction.broadcast!==false)throw new Error(`${sample.name} unsigned transaction proof failed.`);
  results.push({name:sample.name,status:prepared.status,recipient:t.to,amountRaw:BigInt(t.value).toString(),chainId:t.chainId,reference:c.reference,broadcast:false});
}

const atlantic=samples[0].invoice.replace("Pharos Pacific Mainnet","Pharos Atlantic");
const atlanticResult=await post("/api/extract",{format:"text",invoice:atlantic});
if(atlanticResult.status!=="BLOCKED"||!atlanticResult.issues.some(x=>x.code==="NETWORK_CHAIN_CONFLICT"))throw new Error("Atlantic + 1672 was not blocked.");
const numeric=JSON.parse(samples[1].invoice);numeric.payment.amount=0.0002;
const numericResult=await post("/api/extract",{format:"json",invoice:JSON.stringify(numeric)});
if(numericResult.status!=="BLOCKED"||!numericResult.issues.some(x=>x.code==="INVALID_AMOUNT_TYPE"))throw new Error("Numeric JSON amount was not blocked.");
const mismatch=await post("/api/extract",{...samples[0],expected:{amount:"0.0002",payee:"0x0000000000000000000000000000000000000001",reference:"OTHER-REF",chainId:1672}});
if(mismatch.status!=="BLOCKED"||mismatch.comparison.length!==3)throw new Error("Mismatch example did not remain blocked.");
const missing=await post("/api/extract",{format:"text",invoice:await fs.readFile("public/samples/missing-field-invoice.txt","utf8")});
if(missing.status!=="BLOCKED"||!missing.issues.some(x=>x.code==="MISSING_PAYEE"))throw new Error("Missing-field example did not remain blocked.");

console.log(JSON.stringify({results,blocked:{atlantic:atlanticResult.issues,numericAmount:numericResult.issues,mismatch:mismatch.comparison,missing:missing.issues}},null,2));
