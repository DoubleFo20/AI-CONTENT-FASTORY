import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMockProvider } from '../server/ai/mock.ts';

// Optional verification runtime stays under ignored .tmp; it is not an app dependency.
// Run with node --import tsx scripts/check-cloud-sql.mjs [review-only SQL path].
const requireRuntime = createRequire(resolve('.tmp/cloud-sql-qa/runtime.cjs'));
const { PGlite } = await import(pathToFileURL(requireRuntime.resolve('@electric-sql/pglite')).href);
const db = new PGlite();
const brief = { name: 'SQL QA', brief: 'A fictional traveler returns a lost notebook.', genre: 'Drama', audience: 'General', aspectRatio: '9:16' };
const provider = createMockProvider();
const ideas = await provider.generateIdeas(brief);
const story = await provider.expandStory(brief, ideas[0]);
const owner = randomUUID();
const another = randomUUID();
const projectId = randomUUID();
const initial = { id: projectId, ownerId: owner, brief, ideas: [], selectedIdeaId: null, package: null, revision: 1 };
let checks = 0;
async function check(label, operation) {
  try { await operation(); checks++; }
  catch (error) { throw new Error(`${label}: ${error instanceof Error ? error.message : 'failed'}`, { cause: error }); }
}
async function scalar(sql, values = []) {
  const result = await db.query(sql, values);
  return Object.values(result.rows[0] ?? {})[0];
}
async function call(name, values, casts) {
  return scalar(`select factory_cloud.${name}(${casts.map((cast, index) => `$${index + 1}::${cast}`).join(',')})`, values);
}
const proof = lease => [lease.job.id, lease.job.ownerId, lease.job.projectId, lease.workerId, lease.token, lease.job.type, lease.job.target, JSON.stringify(lease.input)];
const proofCasts = ['uuid', 'uuid', 'uuid', 'text', 'uuid', 'text', 'text', 'jsonb'];
try {
  await check('DDL compiles in an empty isolated PostgreSQL engine', async () => {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(await readFile(resolve(process.argv[2] ?? 'docs/sql/supabase-core.sql'), 'utf8'));
  });
  await check('private grants, RLS and invoker functions', async () => {
    const tables = await db.query("select relrowsecurity,relforcerowsecurity from pg_class join pg_namespace on pg_class.relnamespace=pg_namespace.oid where nspname='factory_cloud' and relkind='r'");
    assert.equal(tables.rows.length, 2);
    assert.ok(tables.rows.every(row => row.relrowsecurity && row.relforcerowsecurity));
    const functions = await db.query("select prosecdef,proconfig from pg_proc join pg_namespace on pg_proc.pronamespace=pg_namespace.oid where nspname='factory_cloud'");
    assert.ok(functions.rows.length > 10);
    assert.ok(functions.rows.every(row => !row.prosecdef && row.proconfig.includes('search_path=pg_catalog')));
    for (const role of ['anon', 'authenticated']) {
      assert.equal(await scalar('select has_schema_privilege($1,$2,$3)', [role, 'factory_cloud', 'USAGE']), false);
      for (const table of ['factory_cloud.projects', 'factory_cloud.jobs']) {
        for (const grant of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) assert.equal(await scalar('select has_table_privilege($1,$2,$3)', [role, table, grant]), false);
      }
      assert.equal(await scalar("select count(*) from pg_proc join pg_namespace on pg_proc.pronamespace=pg_namespace.oid where nspname='factory_cloud' and has_function_privilege($1,pg_proc.oid,'EXECUTE')", [role]), 0);
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from factory_cloud.projects'), error => error.code === '42501');
      await assert.rejects(db.query('select factory_cloud.list_projects($1::uuid)', [owner]), error => error.code === '42501');
      await db.exec('reset role');
    }
    assert.equal(await scalar("select has_schema_privilege('service_role','factory_cloud','CREATE')"), false);
    assert.equal(await scalar("select has_table_privilege('service_role','factory_cloud.jobs','DELETE')"), false);
  });
  await db.exec('set role service_role');
  await check('owner isolation, initial persistence and revision conflicts', async () => {
    assert.equal(await call('save_project', [owner, JSON.stringify(initial)], ['uuid', 'jsonb']), true);
    assert.equal(await call('save_project', [owner, JSON.stringify(initial)], ['uuid', 'jsonb']), true);
    assert.deepEqual(await call('list_projects', [another], ['uuid']), []);
    assert.equal((await call('list_projects', [owner], ['uuid'])).length, 1);
    await assert.rejects(call('save_project', [another, JSON.stringify({ ...initial, ownerId: another })], ['uuid', 'jsonb']), /NOT_FOUND/);
    await assert.rejects(call('save_project', [owner, JSON.stringify({ ...initial, revision: 3 })], ['uuid', 'jsonb']), /CONFLICT/);
  });
  const queued = await call('enqueue_job', [owner, projectId, JSON.stringify({ type: 'ideas', brief })], ['uuid', 'uuid', 'jsonb']);
  let lease;
  await check('exclusive enqueue, target routing and fencing', async () => {
    assert.equal(queued.target, 'cloud');
    await assert.rejects(call('enqueue_job', [owner, projectId, JSON.stringify({ type: 'ideas', brief })], ['uuid', 'uuid', 'jsonb']), /CONFLICT/);
    await assert.rejects(call('save_project', [owner, JSON.stringify({ ...initial, revision: 2 })], ['uuid', 'jsonb']), /CONFLICT/);
    assert.equal(await call('claim_job', ['local-qa', 'local'], ['text', 'text']), null);
    lease = await call('claim_job', ['cloud-qa', 'cloud'], ['text', 'text']);
    assert.equal(lease.job.id, queued.id);
    assert.equal(await call('claim_job', ['other-worker', 'cloud'], ['text', 'text']), null);
    const forged = { ...lease, token: randomUUID() };
    assert.equal(await call('heartbeat_job', [...proof(forged), 10], [...proofCasts, 'integer']), false);
    assert.equal(await call('complete_job', [...proof(forged), JSON.stringify({ ideas })], [...proofCasts, 'jsonb']), false);
    assert.equal(await call('heartbeat_job', [...proof(lease), 10], [...proofCasts, 'integer']), true);
    await assert.rejects(call('complete_job', [...proof(lease), JSON.stringify({ ideas: ideas.slice(0, 9) })], [...proofCasts, 'jsonb']), /AI_INVALID_OUTPUT/);
    assert.equal(await call('complete_job', [...proof(lease), JSON.stringify({ ideas })], [...proofCasts, 'jsonb']), true);
    assert.equal(await call('complete_job', [...proof(lease), JSON.stringify({ ideas })], [...proofCasts, 'jsonb']), false);
  });
  await check('selected-only expansion and atomic retained content', async () => {
    const snapshot = await scalar('select snapshot from factory_cloud.projects where id=$1::uuid', [projectId]);
    assert.equal(snapshot.revision, 2);
    assert.equal(snapshot.ideas.length, 10);
    await call('save_project', [owner, JSON.stringify({ ...snapshot, selectedIdeaId: ideas[0].id, revision: 3 })], ['uuid', 'jsonb']);
    await assert.rejects(call('enqueue_job', [owner, projectId, JSON.stringify({ type: 'expand', brief, selectedIdea: ideas[1] })], ['uuid', 'uuid', 'jsonb']), /CONFLICT/);
    await call('enqueue_job', [owner, projectId, JSON.stringify({ type: 'expand', brief, selectedIdea: ideas[0] })], ['uuid', 'uuid', 'jsonb']);
    const expansion = await call('claim_job', ['cloud-qa', 'cloud'], ['text', 'text']);
    const invalid = globalThis.structuredClone(story); invalid.scenes[0].locationId = 'missing-location';
    await assert.rejects(call('complete_job', [...proof(expansion), JSON.stringify(invalid)], [...proofCasts, 'jsonb']), /AI_INVALID_OUTPUT/);
    assert.equal(await call('complete_job', [...proof(expansion), JSON.stringify(story)], [...proofCasts, 'jsonb']), true);
    const expanded = await scalar('select snapshot from factory_cloud.projects where id=$1::uuid', [projectId]);
    assert.equal(expanded.revision, 4); assert.deepEqual(expanded.package, story); assert.deepEqual(expanded.ideas, ideas);
    await assert.rejects(call('save_project', [owner, JSON.stringify({ ...expanded, package: null, revision: 5 })], ['uuid', 'jsonb']), /CONFLICT/);
  });
  await check('expired leases fail without automatic provider replay', async () => {
    const exportInput = { type: 'export', aspectRatio: brief.aspectRatio, sceneIds: story.scenes.map(scene => scene.id) };
    const job = await call('enqueue_job', [owner, projectId, JSON.stringify(exportInput)], ['uuid', 'uuid', 'jsonb']);
    assert.equal(job.target, 'local');
    assert.equal(await call('claim_job', ['cloud-qa', 'cloud'], ['text', 'text']), null);
    const editing = await call('claim_job', ['local-qa', 'local'], ['text', 'text']);
    await db.query("update factory_cloud.jobs set lease_expires=clock_timestamp()-interval '1 second' where id=$1::uuid", [editing.job.id]);
    assert.equal(await call('heartbeat_job', [...proof(editing), 50], [...proofCasts, 'integer']), false);
    assert.equal(await call('complete_job', [...proof(editing), JSON.stringify({ exportId: randomUUID() })], [...proofCasts, 'jsonb']), false);
    assert.equal(await call('claim_job', ['local-qa', 'local'], ['text', 'text']), null);
    const failed = await db.query('select status,error_code from factory_cloud.jobs where id=$1::uuid', [editing.job.id]);
    assert.deepEqual(failed.rows[0], { status: 'failed', error_code: 'INTERRUPTED' });
    const snapshot = await scalar('select snapshot from factory_cloud.projects where id=$1::uuid', [projectId]);
    assert.deepEqual(snapshot.package, story);
  });
  console.log(`Cloud SQL verification passed ${checks} groups in isolated PGlite PostgreSQL. Multi-connection concurrency and hosted Supabase remain separate gates.`);
} catch (error) {
  console.error((error instanceof Error ? error.message : 'Cloud SQL verification failed').slice(0, 800));
  process.exitCode = 1;
} finally { await db.close(); }
