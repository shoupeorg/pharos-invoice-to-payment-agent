import test from "node:test";
import assert from "node:assert/strict";
import {buildUnsigned,encodeReference,extractInvoice,fingerprint} from "../src/engine.js";
import {SAMPLE} from "../src/constants.js";
import {paymentSummary,route} from "../src/worker.js";
import * as store from "../src/store.js";

class MockDB{
  constructor(){this.workspaces=[];this.preparations=[];}
  prepare(sql){const db=this;return{args:[],bind(...args){this.args=args;return this;},async run(){const a=this.args;if(sql.startsWith("INSERT INTO workspaces")){db.workspaces.push({id:a[0],capability_hash:a[1],created_at:a[2]});return{};}if(sql.startsWith("INSERT INTO preparations")){if(db.preparations.some(x=>x.workspace_id===a[1]&&x.fingerprint===a[2]))throw new Error("UNIQUE");db.preparations.push({id:a[0],workspace_id:a[1],fingerprint:a[2],source_format:a[3],canonical:a[4],verification:a[5],transaction_json:a[6],summary_markdown:a[7],created_at:a[8]});return{};}throw new Error(`Unsupported run: ${sql}`);},async first(){const a=this.args;if(sql.startsWith("SELECT 1 ok"))return db.workspaces.some(x=>x.id===a[0]&&x.capability_hash===a[1])?{ok:1}:null;if(sql.includes("workspace_id=? AND fingerprint=?"))return db.preparations.find(x=>x.workspace_id===a[0]&&x.fingerprint===a[1])||null;if(sql.includes("workspace_id=? AND id=?"))return db.preparations.find(x=>x.workspace_id===a[0]&&x.id===a[1])||null;throw new Error(`Unsupported first: ${sql}`);},async all(){const a=this.args;if(sql.startsWith("SELECT * FROM preparations"))return{results:db.preparations.filter(x=>x.workspace_id===a[0]).sort((x,y)=>y.created_at.localeCompare(x.created_at))};throw new Error(`Unsupported all: ${sql}`);}};}
}

const invoice=`Invoice Reference: PH-2026-1001\nPayee: ${SAMPLE.payee}\nAmount: 0.0001\nAsset: native:1672\nCurrency: PROS\nNetwork: Pharos Pacific Mainnet\nChain ID: 1672`;
const verification=c=>({status:"VERIFIED",chainId:1672,blockNumber:"123",recipient:c.payee,accountType:"EOA",gasEstimate:null,gasLimitation:"Gas estimate unavailable.",mcpEndpoint:"https://mcp.pharos.xyz/mcp",tools:["get_chain_info","get_code"]});

test("prepare endpoint requires exact human confirmation before any live call",async()=>{
  const db=new MockDB(),cap="capability",digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(cap)))].map(x=>x.toString(16).padStart(2,"0")).join("");
  await store.createWorkspace(db,"workspace",digest,"2026-10-22T00:00:00Z");
  const request=new Request("https://example.test/api/prepare",{method:"POST",headers:{"content-type":"application/json","x-workspace-id":"workspace","x-workspace-capability":cap},body:JSON.stringify({format:"text",invoice})});
  await assert.rejects(()=>route(request,{DB:db}),/Exact human review confirmation is required/);
});

test("same invoice deduplicates inside one workspace but not across workspaces",async()=>{
  const db=new MockDB(),canonical=extractInvoice("text",invoice).canonical,fp=await fingerprint(canonical),prepared=buildUnsigned(canonical,verification(canonical),"2026-10-22T00:00:00Z");
  const make=(id,workspaceId)=>({id,workspaceId,fingerprint:fp,sourceFormat:"text",canonical,verification:verification(canonical),transaction:prepared,summary:"summary",createdAt:`2026-10-22T00:00:0${id.length}Z`});
  assert.equal((await store.save(db,make("a","one"))).replayed,false);
  const replay=await store.save(db,make("b","one"));assert.equal(replay.replayed,true);assert.equal(replay.record.id,"a");
  assert.equal((await store.save(db,make("c","two"))).replayed,false);
  assert.equal((await store.list(db,"one")).length,1);assert.equal((await store.list(db,"two")).length,1);
});

test("exports contain the same prepared record values and provenance",()=>{
  const canonical=extractInvoice("text",invoice).canonical,v=verification(canonical),prepared=buildUnsigned(canonical,v,"2026-10-22T00:00:00Z"),record={canonical,verification:v,transaction:prepared};
  const markdown=paymentSummary(record,"text");
  for(const value of[canonical.reference,canonical.payee,canonical.amountRaw,prepared.transaction.data,prepared.decoded.reference,v.blockNumber,v.mcpEndpoint])assert.match(markdown,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  assert.equal(prepared.transaction.data,encodeReference(canonical.reference));assert.match(markdown,/UNSIGNED/);assert.match(markdown,/NOT BROADCAST/);
});
