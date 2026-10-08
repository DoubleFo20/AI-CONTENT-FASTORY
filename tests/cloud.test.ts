import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Idea, ProjectInput, StoryPackage } from '../shared/contracts.js';
import type { CloudJobInput, CloudLease, CloudProjectSnapshot } from '../shared/integrations.js';
import { MemoryCloudRepository } from '../server/cloud/memory.js';
import { createSupabaseRepository, SupabaseCloudRepository } from '../server/cloud/supabase.js';
import { CloudRunner } from '../server/cloud/runner.js';
import { AppError } from '../server/errors.js';

const owner = randomUUID(); const stranger = randomUUID();
const brief: ProjectInput = { name:'Train', brief:'A traveller finds memories on the last train.', genre:'Fantasy', audience:'General', aspectRatio:'9:16' };
const localized = (value: string) => ({ th:`${value} ไทย`, en:value });
const ideas: Idea[] = Array.from({length:10},(_,i)=>({id:`idea_${i+1}`,title:localized(`Story ${i+1}`),logline:localized(`Logline ${i+1}`),hook:localized(`Hook ${i+1}`)}));
function snapshot(id=randomUUID()): CloudProjectSnapshot { return { id,ownerId:owner,brief:structuredClone(brief),ideas:[],selectedIdeaId:null,package:null,revision:1 }; }
function story(): StoryPackage {
  return { storyBible:localized('Story'),characters:[{id:'char_1',name:'Thanwa',visualDescriptionEn:'Navy jacket',background:localized('Traveller')}],locations:[{id:'loc_1',name:localized('Train'),visualDescriptionEn:'Amber light',description:localized('Carriage')}],continuityRules:[localized('Keep jacket')],scenes:[1,2,3].map(order=>({id:`scene_${order}`,order,title:localized(`Scene ${order}`),durationSeconds:6,explanationTh:`ฉาก ${order}`,flowPromptEn:`Shot ${order}`,narration:localized('Narration'),characterIds:['char_1'],locationId:'loc_1'})) };
}
async function seeded(repository=new MemoryCloudRepository()) {
  const project=snapshot(); await repository.saveProject(owner,project); return {repository,project};
}
const errorIs = (code: string) => (error: unknown) => error instanceof AppError && error.code===code && error.message===code;

test('snapshot ownership, strict content validation, bounded owner list and revision CAS',async()=>{
  const {repository,project}=await seeded();
  assert.equal(await repository.project(stranger,project.id),null);
  assert.deepEqual(await repository.projects(stranger),[]);
  await assert.rejects(repository.saveProject(stranger,project),errorIs('INVALID_INPUT'));
  await assert.rejects(repository.saveProject(stranger,{...project,ownerId:stranger}),errorIs('NOT_FOUND'));
  await assert.rejects(repository.saveProject(owner,{...project,revision:3}),errorIs('CONFLICT'));
  const revisions=await Promise.allSettled([repository.saveProject(owner,{...project,revision:2,brief:{...brief,name:'A'}}),repository.saveProject(owner,{...project,revision:2,brief:{...brief,name:'B'}})]);
  assert.equal(revisions.filter(result=>result.status==='fulfilled').length,1);
  const badPackage={...story(),scenes:story().scenes.map(scene=>({...scene,locationId:'missing'}))};
  await assert.rejects(repository.saveProject(owner,{...snapshot(),ideas,selectedIdeaId:ideas[0].id,package:badPackage}),errorIs('INVALID_INPUT'));
  for(let i=0;i<101;i++) await repository.saveProject(owner,snapshot());
  assert.equal((await repository.projects(owner)).length,100);
  const returned=await repository.project(owner,project.id); returned!.brief.name='Mutated client copy';
  assert.notEqual((await repository.project(owner,project.id))!.brief.name,'Mutated client copy');
});

test('parallel enqueue/claim have one active job per project and exactly one winner',async()=>{
  const {repository,project}=await seeded();
  const enqueue=await Promise.allSettled(Array.from({length:8},()=>repository.enqueue(owner,project.id,{type:'ideas',brief})));
  assert.equal(enqueue.filter(value=>value.status==='fulfilled').length,1);
  await assert.rejects(repository.saveProject(owner,{...project,revision:2}),errorIs('CONFLICT'));
  await assert.rejects(repository.enqueue(stranger,project.id,{type:'ideas',brief}),errorIs('NOT_FOUND'));
  assert.deepEqual(await repository.jobs(stranger,project.id),[]);
  const leases=await Promise.all(Array.from({length:8},(_,i)=>repository.claim(`worker_${i}`,'cloud')));
  assert.equal(leases.filter(Boolean).length,1);
});

test('lease rejects wrong identity, owner, project, token and stored input; heartbeat is monotonic',async()=>{
  let now=Date.UTC(2026,9,9); const repository=new MemoryCloudRepository({now:()=>now,leaseMs:1000});
  const {project}=await seeded(repository); await repository.enqueue(owner,project.id,{type:'ideas',brief});
  const lease=(await repository.claim('worker_1','cloud'))!;
  for(const wrong of [ {...lease,workerId:'worker_2'}, {...lease,token:randomUUID()}, {...lease,job:{...lease.job,ownerId:stranger}}, {...lease,job:{...lease.job,projectId:randomUUID()}}, {...lease,input:{type:'ideas',brief:{...brief,name:'Forged'}} as CloudJobInput} ]) {
    assert.equal(await repository.heartbeat(wrong,50),false); assert.equal(await repository.complete(wrong,ideas),false); assert.equal(await repository.fail(wrong,'AI_TIMEOUT'),false);
  }
  now+=800; assert.equal(await repository.heartbeat(lease,50),true); now+=800;
  assert.equal(await repository.heartbeat(lease,10),true); assert.equal((await repository.jobs(owner,project.id))[0].progress,50);
  now+=1000; assert.equal(await repository.complete(lease,ideas),false);
  const failed=(await repository.jobs(owner,project.id))[0]; assert.equal(failed.status,'failed'); assert.equal(failed.errorCode,'INTERRUPTED');
  assert.equal(await repository.claim('worker_3','cloud'),null); // No replay after expiry.
  await repository.enqueue(owner,project.id,{type:'ideas',brief}); const replacement=(await repository.claim('worker_3','cloud'))!;
  assert.notEqual(replacement.token,lease.token); assert.equal(await repository.fail(lease,'AI_TIMEOUT'),false);
});

test('ten ideas, persisted single selection, selected-only expansion and atomic invalid-result preservation',async()=>{
  const {repository,project}=await seeded(); await repository.enqueue(owner,project.id,{type:'ideas',brief});
  const lease=(await repository.claim('worker_1','cloud'))!;
  await assert.rejects(repository.complete(lease,ideas.slice(0,9)),errorIs('AI_INVALID_OUTPUT'));
  assert.equal((await repository.project(owner,project.id))!.ideas.length,0);
  await assert.rejects(repository.complete(lease,Array.from({length:10},()=>ideas[0])),errorIs('AI_INVALID_OUTPUT'));
  assert.equal(await repository.complete(lease,{ideas}),true);
  assert.equal(await repository.complete(lease,{ideas}),false);
  const ready=(await repository.project(owner,project.id))!; assert.equal(ready.revision,2);
  await assert.rejects(repository.enqueue(owner,project.id,{type:'expand',brief,selectedIdea:ideas[0]}),errorIs('SELECTION_REQUIRED'));
  await repository.saveProject(owner,{...ready,selectedIdeaId:ideas[4].id,revision:3});
  await assert.rejects(repository.enqueue(owner,project.id,{type:'expand',brief,selectedIdea:ideas[0]}),errorIs('CONFLICT'));
  await repository.enqueue(owner,project.id,{type:'expand',brief,selectedIdea:ideas[4]});
  const expansion=(await repository.claim('worker_2','cloud'))!; assert.equal(expansion.input.type,'expand');
  if(expansion.input.type==='expand') assert.deepEqual(expansion.input.selectedIdea,ideas[4]);
  const bad=story(); bad.scenes[0].characterIds=['missing'];
  await assert.rejects(repository.complete(expansion,bad),errorIs('AI_INVALID_OUTPUT'));
  assert.equal((await repository.project(owner,project.id))!.package,null);
  assert.equal(await repository.complete(expansion,story()),true);
  const expanded=(await repository.project(owner,project.id))!; assert.equal(expanded.revision,4);
  await assert.rejects(repository.saveProject(owner,{...expanded,selectedIdeaId:ideas[0].id,revision:5}),errorIs('CONFLICT'));
  await assert.rejects(repository.saveProject(owner,{...expanded,package:null,revision:5}),errorIs('CONFLICT'));
});

test('exports target local only, validate ordered scene receipt, and failed jobs preserve prior content',async()=>{
  const repository=new MemoryCloudRepository(); const project={...snapshot(),ideas,selectedIdeaId:ideas[0].id,package:story()};
  await repository.saveProject(owner,project);
  await assert.rejects(repository.enqueue(owner,project.id,{type:'export',aspectRatio:'9:16',sceneIds:['scene_1','scene_1','scene_3']}),errorIs('INVALID_INPUT'));
  await assert.rejects(repository.enqueue(owner,project.id,{type:'export',aspectRatio:'9:16',sceneIds:['scene_2','scene_1','scene_3']}),errorIs('CONFLICT'));
  const job=await repository.enqueue(owner,project.id,{type:'export',aspectRatio:'9:16',sceneIds:['scene_1','scene_2','scene_3']}); assert.equal(job.target,'local');
  assert.equal(await repository.claim('cloud_worker','cloud'),null);
  const lease=(await repository.claim('local_worker','local'))!;
  await assert.rejects(repository.complete(lease,{exportId:'raw-private-path.mp4'}),errorIs('EXPORT_FAILED'));
  assert.equal(await repository.fail(lease,'private upstream detail'),true);
  assert.deepEqual(await repository.project(owner,project.id),project);
  assert.equal((await repository.jobs(owner,project.id))[0].errorCode,'INTERNAL_ERROR');
});

const url='https://abcdefghijklmnopqrst.supabase.co';
const secret='sb_secret_' + 'test_fixture_'.repeat(3);
const legacy=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from('{"role":"service_role"}').toString('base64url'),'fixture_signature'].join('.');
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status});
test('Supabase factory remains opt-in, rejects unsafe hosts/anon credentials before any request',()=>{
  assert.equal(createSupabaseRepository(),null); assert.equal(createSupabaseRepository({url}),null);
  for(const bad of ['http://abcdefghijklmnopqrst.supabase.co','https://evil.example','https://abcdefghijklmnopqrst.supabase.co.evil.example','https://user:pass@abcdefghijklmnopqrst.supabase.co','https://abcdefghijklmnopqrst.supabase.co/path','https://abcdefghijklmnopqrst.supabase.co/?key=private']) {
    assert.throws(()=>new SupabaseCloudRepository({url:bad,secretKey:secret}),errorIs('INVALID_INPUT'));
  }
  for(const key of ['sb_publishable_fixture_only_not_a_real_key_1234567890',legacy.replace(Buffer.from('{"role":"service_role"}').toString('base64url'),Buffer.from('{"role":"anon"}').toString('base64url'))]) assert.throws(()=>new SupabaseCloudRepository({url,serviceRoleKey:key}),errorIs('INVALID_INPUT'));
});
test('secret headers omit Bearer, legacy service_role uses Bearer; fixed schema RPC and owner REST filters',async()=>{
  for(const key of [secret,legacy]) {
    const requests:Array<{url:string;init:RequestInit}>=[]; const project=snapshot();
    const repository=new SupabaseCloudRepository({url,serviceRoleKey:key,fetchImpl:async(address,init)=>{requests.push({url:String(address),init:init!});return String(address).includes('/rpc/save_project')?json(true):json([{snapshot:project}]);}});
    await repository.saveProject(owner,project); assert.deepEqual(await repository.project(owner,project.id),project);
    const headers=new Headers(requests[0].init.headers); assert.equal(headers.get('apikey'),key); assert.equal(headers.get('Authorization'),key===secret?null:`Bearer ${key}`);
    assert.equal(headers.get('Content-Profile'),'factory_cloud'); assert.equal(headers.get('Accept-Profile'),'factory_cloud'); assert.equal(requests[0].init.redirect,'error');
    assert.match(requests[1].url,new RegExp(`owner_id=eq.${owner}`)); assert.match(requests[1].url,new RegExp(`id=eq.${project.id}`));
    assert.equal(JSON.parse(String(requests[0].init.body)).p_snapshot.ownerId,owner);
  }
});
test('Supabase list and lease mutation validate owner/input and strict gateway responses',async()=>{
  const memory=new MemoryCloudRepository(); const {project}=await seeded(memory); const job=await memory.enqueue(owner,project.id,{type:'ideas',brief}); const lease=(await memory.claim('worker','cloud'))!;
  const bodies:unknown[]=[];
  const repository=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async(address,init)=>{bodies.push(JSON.parse(String(init?.body)));return String(address).endsWith('list_projects')?json([project]):String(address).endsWith('list_jobs')?json([job]):String(address).endsWith('claim_job')?json(lease):json(true);}});
  assert.deepEqual(await repository.projects(owner),[project]); assert.deepEqual(await repository.claim('worker','cloud'),lease);
  assert.equal(await repository.heartbeat(lease,25),true); assert.equal(await repository.complete(lease,ideas),true); assert.equal(await repository.fail(lease,'private detail'),true);
  assert.deepEqual(await repository.jobs(owner,project.id),[job]);
  const payload=bodies[3] as Record<string,unknown>; assert.deepEqual(payload.p_input,lease.input); assert.equal(payload.p_token,lease.token); assert.equal(payload.p_target,job.target); assert.deepEqual(payload.p_result,{ideas});
  const wrongOwner=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>json([{...project,ownerId:stranger}])}); await assert.rejects(wrongOwner.projects(owner),errorIs('INTERNAL_ERROR'));
  const wrongJob=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>json({...job,ownerId:stranger})}); await assert.rejects(wrongJob.enqueue(owner,project.id,{type:'ideas',brief}),errorIs('INTERNAL_ERROR'));
  const wrongJobs=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>json([{...job,ownerId:stranger}])}); await assert.rejects(wrongJobs.jobs(owner,project.id),errorIs('INTERNAL_ERROR'));
});
test('gateway errors, malformed bodies and network errors are redacted and never retried',async()=>{
  for(const response of [()=>json({message:'private provider trace secret'},500),()=>new Response('private non-JSON trace',{status:500}),()=>json({message:'CONFLICT'},409),()=>json({unexpected:'private detail'}),()=>{throw new Error('private network credential');}]) {
    let calls=0; const repository=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>{calls++;return response();}});
    await assert.rejects(repository.saveProject(owner,snapshot()),(error:unknown)=>{assert.ok(error instanceof AppError);assert.doesNotMatch(error.message,/private|trace|secret|credential/);return true;}); assert.equal(calls,1);
  }
});
test('gateway refuses redirected/different origin and oversize streamed success or error bodies',async()=>{
  for(const status of [200,500]) {
    let cancelled=false; const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(8*1024*1024+1));},cancel(){cancelled=true;}});
    const repository=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>new Response(stream,{status})});
    await assert.rejects(repository.projects(owner),errorIs('INTERNAL_ERROR')); assert.equal(cancelled,true);
  }
  for(const fields of [{redirected:true},{url:'https://evil.example/rest/v1/projects'}]) {
    const response=json([]); for(const [key,value] of Object.entries(fields)) Object.defineProperty(response,key,{value});
    const repository=new SupabaseCloudRepository({url,secretKey:secret,fetchImpl:async()=>response}); await assert.rejects(repository.projects(owner),errorIs('INTERNAL_ERROR'));
  }
});
test('gateway bounds a hanging fetch and stream, aborting/cancelling without error details',async()=>{
  const hanging=new SupabaseCloudRepository({url,secretKey:secret,timeoutMs:10,fetchImpl:async(_address,init)=>new Promise((_resolve,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('private transport detail'))))});
  await assert.rejects(hanging.projects(owner),errorIs('INTERRUPTED'));
  let cancelled=false; const stream=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
  const repository=new SupabaseCloudRepository({url,secretKey:secret,timeoutMs:10,fetchImpl:async()=>new Response(stream)});
  await assert.rejects(repository.projects(owner),errorIs('INTERRUPTED')); assert.equal(cancelled,true);
});

test('runner serializes concurrent calls, sends only frozen selected input, heartbeats and completes',async()=>{
  const repository=new MemoryCloudRepository(); const project={...snapshot(),ideas,selectedIdeaId:ideas[3].id}; await repository.saveProject(owner,project); await repository.enqueue(owner,project.id,{type:'expand',brief,selectedIdea:ideas[3]});
  let executions=0; const runner=new CloudRunner({repository,workerId:'runner',heartbeatMs:2,execute:async(input)=>{executions++;assert.equal(input.type,'expand');if(input.type==='expand')assert.deepEqual(input.selectedIdea,ideas[3]);await new Promise(resolve=>setTimeout(resolve,8));return story();}});
  const pending=runner.runNext(); assert.equal(runner.runNext(),pending); assert.equal(await pending,true); assert.equal(executions,1);
  assert.equal((await repository.jobs(owner,project.id))[0].status,'completed'); await runner.stop(); assert.equal(await runner.runNext(),false);
});
test('runner timeout/stop, malformed result and provider failure preserve snapshots without replay',async()=>{
  for(const mode of ['timeout','stop','invalid','provider'] as const) {
    const {repository,project}=await seeded(); await repository.enqueue(owner,project.id,{type:'ideas',brief}); let calls=0;
    const runner=new CloudRunner({repository,workerId:'runner',maxRunMs:10,heartbeatMs:2,execute:async()=>{calls++;if(mode==='invalid')return {ideas:[]};if(mode==='provider')throw new AppError('AI_QUOTA_EXCEEDED');return new Promise(()=>{});}});
    const pending=runner.runNext(); if(mode==='stop'){await new Promise(resolve=>setTimeout(resolve,1));await runner.stop();} await pending;
    const job=(await repository.jobs(owner,project.id))[0]; assert.equal(job.status,'failed'); assert.equal(job.errorCode,mode==='invalid'?'AI_INVALID_OUTPUT':mode==='provider'?'AI_QUOTA_EXCEEDED':'INTERRUPTED');
    assert.deepEqual(await repository.project(owner,project.id),project); assert.equal(calls,1); assert.equal(await runner.runNext(),false); await runner.stop();
  }
});
test('runner abandons lease loss without applying late results',async()=>{
  const {repository,project}=await seeded(); await repository.enqueue(owner,project.id,{type:'ideas',brief}); const original=repository.heartbeat.bind(repository); let captured:CloudLease|undefined;
  repository.heartbeat=async(lease,progress)=>{captured=lease;await original(lease,progress);return false;};
  const runner=new CloudRunner({repository,workerId:'runner',heartbeatMs:2,execute:async(_input,signal)=>{await new Promise(resolve=>setTimeout(resolve,15));assert.equal(signal.aborted,true);return {ideas};}});
  assert.equal(await runner.runNext(),true); assert.ok(captured); assert.equal((await repository.project(owner,project.id))!.ideas.length,0); await runner.stop();
});
