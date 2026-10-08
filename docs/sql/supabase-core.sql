-- REVIEW-ONLY DRAFT. NOT APPLIED. No migration/deployment is authorized by this file.
-- Expose factory_cloud ONLY after review; anon/authenticated have no privileges.
-- All functions are SECURITY INVOKER. Trusted server service_role is the only API role.
begin;
create schema factory_cloud;
revoke all on schema factory_cloud from public, anon, authenticated;
grant usage on schema factory_cloud to service_role;
alter default privileges in schema factory_cloud revoke execute on functions from public;

create function factory_cloud.keys_ok(v jsonb, names text[]) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then return false; end if;
  return (select count(*) = cardinality(names) and bool_and(k = any(names)) from jsonb_object_keys(v) k);
end $$;
create function factory_cloud.text_ok(v jsonb, lo integer, hi integer) returns boolean
language sql immutable security invoker set search_path = pg_catalog as $$
  select coalesce(jsonb_typeof(v) = 'string' and length(v #>> '{}') between lo and hi, false)
$$;
create function factory_cloud.number_ok(v jsonb, lo integer, hi integer) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare n numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then return false; end if;
  n := (v #>> '{}')::numeric; return n = trunc(n) and n between lo and hi;
exception when others then return false;
end $$;
create function factory_cloud.localized_ok(v jsonb) returns boolean
language sql immutable security invoker set search_path = pg_catalog as $$
  select factory_cloud.keys_ok(v,array['th','en']) and factory_cloud.text_ok(v->'th',1,8000) and factory_cloud.text_ok(v->'en',1,8000)
$$;
create function factory_cloud.brief_ok(v jsonb) returns boolean
language sql immutable security invoker set search_path = pg_catalog as $$
  select factory_cloud.keys_ok(v,array['name','brief','genre','audience','aspectRatio'])
    and factory_cloud.text_ok(v->'name',1,120) and length(btrim(v->>'name')) > 0
    and factory_cloud.text_ok(v->'brief',10,4000) and length(btrim(v->>'brief')) >= 10
    and factory_cloud.text_ok(v->'genre',1,100) and length(btrim(v->>'genre')) > 0
    and factory_cloud.text_ok(v->'audience',1,120) and length(btrim(v->>'audience')) > 0
    and v->>'aspectRatio' in ('9:16','16:9','1:1')
$$;
create function factory_cloud.idea_ok(v jsonb) returns boolean
language sql immutable security invoker set search_path = pg_catalog as $$
  select factory_cloud.keys_ok(v,array['id','title','logline','hook']) and factory_cloud.text_ok(v->'id',1,64)
    and factory_cloud.localized_ok(v->'title') and factory_cloud.localized_ok(v->'logline') and factory_cloud.localized_ok(v->'hook')
$$;
create function factory_cloud.ideas_ok(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
begin
  if jsonb_typeof(v) is distinct from 'array' then return false; end if;
  if jsonb_array_length(v) <> 10 then return false; end if;
  return (select bool_and(factory_cloud.idea_ok(x)) and count(distinct x->>'id') = 10 from jsonb_array_elements(v) x);
end $$;
create function factory_cloud.package_ok(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
declare v_element jsonb; item jsonb; idx integer := 0; total integer := 0;
begin
  if not factory_cloud.keys_ok(v,array['storyBible','characters','locations','continuityRules','scenes']) or not factory_cloud.localized_ok(v->'storyBible') then return false; end if;
  if jsonb_typeof(v->'characters') is distinct from 'array' or jsonb_typeof(v->'locations') is distinct from 'array'
    or jsonb_typeof(v->'continuityRules') is distinct from 'array' or jsonb_typeof(v->'scenes') is distinct from 'array' then return false; end if;
  if jsonb_array_length(v->'characters') not between 1 and 6 or jsonb_array_length(v->'locations') not between 1 and 6
    or jsonb_array_length(v->'continuityRules') not between 1 and 12 or jsonb_array_length(v->'scenes') not between 3 and 12 then return false; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(v->'characters') x) <> jsonb_array_length(v->'characters')
    or (select count(distinct x->>'id') from jsonb_array_elements(v->'locations') x) <> jsonb_array_length(v->'locations')
    or (select count(distinct x->>'id') from jsonb_array_elements(v->'scenes') x) <> jsonb_array_length(v->'scenes') then return false; end if;
  for v_element in select value from jsonb_array_elements(v->'characters') loop
    if not factory_cloud.keys_ok(v_element,array['id','name','visualDescriptionEn','background']) or not factory_cloud.text_ok(v_element->'id',1,64)
      or not factory_cloud.text_ok(v_element->'name',1,120) or not factory_cloud.text_ok(v_element->'visualDescriptionEn',1,2000)
      or not factory_cloud.localized_ok(v_element->'background') then return false; end if;
  end loop;
  for v_element in select value from jsonb_array_elements(v->'locations') loop
    if not factory_cloud.keys_ok(v_element,array['id','name','visualDescriptionEn','description']) or not factory_cloud.text_ok(v_element->'id',1,64)
      or not factory_cloud.localized_ok(v_element->'name') or not factory_cloud.text_ok(v_element->'visualDescriptionEn',1,2000)
      or not factory_cloud.localized_ok(v_element->'description') then return false; end if;
  end loop;
  for v_element in select value from jsonb_array_elements(v->'continuityRules') loop
    if not factory_cloud.localized_ok(v_element) then return false; end if;
  end loop;
  for v_element in select value from jsonb_array_elements(v->'scenes') loop
    idx := idx + 1;
    if not factory_cloud.keys_ok(v_element,array['id','order','title','durationSeconds','explanationTh','flowPromptEn','narration','characterIds','locationId'])
      or not factory_cloud.text_ok(v_element->'id',1,64) or not factory_cloud.number_ok(v_element->'order',idx,idx)
      or not factory_cloud.number_ok(v_element->'durationSeconds',4,20) or not factory_cloud.localized_ok(v_element->'title')
      or not factory_cloud.text_ok(v_element->'explanationTh',1,4000) or not factory_cloud.text_ok(v_element->'flowPromptEn',1,4000)
      or not factory_cloud.localized_ok(v_element->'narration') or not factory_cloud.text_ok(v_element->'locationId',1,64)
      or jsonb_typeof(v_element->'characterIds') is distinct from 'array' then return false; end if;
    if jsonb_array_length(v_element->'characterIds') not between 1 and 6 then return false; end if;
    for item in select value from jsonb_array_elements(v_element->'characterIds') loop
      if not factory_cloud.text_ok(item,1,64) or not exists(select 1 from jsonb_array_elements(v->'characters') ch where ch->>'id' = item #>> '{}') then return false; end if;
    end loop;
    if not exists(select 1 from jsonb_array_elements(v->'locations') loc where loc->>'id' = v_element->>'locationId') then return false; end if;
    total := total + (v_element->>'durationSeconds')::numeric::integer;
  end loop;
  return total <= 180;
end $$;
create function factory_cloud.snapshot_ok(v jsonb, owner uuid) returns boolean
language plpgsql immutable security invoker set search_path = pg_catalog as $$
begin
  if not factory_cloud.keys_ok(v,array['id','ownerId','brief','ideas','selectedIdeaId','package','revision'])
    or not factory_cloud.text_ok(v->'id',36,36) or not factory_cloud.text_ok(v->'ownerId',36,36)
    or (v->>'ownerId')::uuid is distinct from owner or not factory_cloud.brief_ok(v->'brief')
    or not factory_cloud.number_ok(v->'revision',1,2147483647) or jsonb_typeof(v->'ideas') is distinct from 'array' then return false; end if;
  perform (v->>'id')::uuid;
  if jsonb_array_length(v->'ideas') <> 0 and not factory_cloud.ideas_ok(v->'ideas') then return false; end if;
  if v->'selectedIdeaId' <> 'null'::jsonb and (not factory_cloud.text_ok(v->'selectedIdeaId',1,64)
    or not exists(select 1 from jsonb_array_elements(v->'ideas') x where x->>'id' = v->>'selectedIdeaId')) then return false; end if;
  if v->'package' <> 'null'::jsonb and (v->'selectedIdeaId' = 'null'::jsonb or not factory_cloud.package_ok(v->'package')) then return false; end if;
  return true;
exception when others then return false;
end $$;

create table factory_cloud.projects (
  id uuid primary key, owner_id uuid not null, snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint project_owner_unique unique(id,owner_id),
  constraint project_snapshot_valid check(factory_cloud.snapshot_ok(snapshot,owner_id) and snapshot->>'id' = id::text)
);
create table factory_cloud.jobs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null, project_id uuid not null,
  type text not null check(type in ('ideas','expand','export')),
  target text not null check(target in ('cloud','local')),
  input jsonb not null, revision integer not null check(revision >= 1),
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  progress integer not null default 0 check(progress between 0 and 100), error_code text, result jsonb,
  worker_id text, fence_token uuid, lease_expires timestamptz,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  foreign key(project_id,owner_id) references factory_cloud.projects(id,owner_id),
  check((type = 'export' and target = 'local') or (type in ('ideas','expand') and target = 'cloud')),
  check((status = 'running' and worker_id is not null and fence_token is not null and lease_expires is not null)
    or (status <> 'running' and worker_id is null and fence_token is null and lease_expires is null))
);
create unique index exclusive_project_job on factory_cloud.jobs(project_id) where status in ('queued','running');
create index claimable_jobs on factory_cloud.jobs(target,created_at,id) where status = 'queued';
create index owner_jobs on factory_cloud.jobs(owner_id,project_id,created_at);
alter table factory_cloud.projects enable row level security;
alter table factory_cloud.projects force row level security;
alter table factory_cloud.jobs enable row level security;
alter table factory_cloud.jobs force row level security;
-- No anon/authenticated policy. service_role bypasses RLS; owner checks remain mandatory in server/RPCs.
revoke all on all tables in schema factory_cloud from public,anon,authenticated;
grant select,insert,update on factory_cloud.projects,factory_cloud.jobs to service_role;

create function factory_cloud.job_json(j factory_cloud.jobs) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$
  select jsonb_build_object('id',j.id,'ownerId',j.owner_id,'projectId',j.project_id,'type',j.type,'target',j.target,
    'status',j.status,'progress',j.progress,'errorCode',j.error_code,
    'createdAt',to_char(j.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(j.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
$$;
create function factory_cloud.expire_jobs() returns void
language sql volatile security invoker set search_path = pg_catalog as $$
  update factory_cloud.jobs set status='failed',error_code='INTERRUPTED',worker_id=null,fence_token=null,lease_expires=null,updated_at=clock_timestamp()
  where status='running' and lease_expires <= clock_timestamp()
$$;
create function factory_cloud.list_projects(p_owner uuid) returns jsonb
language sql stable security invoker set search_path = pg_catalog as $$
  select coalesce(jsonb_agg(snapshot order by created_at desc,id desc),'[]'::jsonb)
  from (select snapshot,created_at,id from factory_cloud.projects where owner_id=p_owner order by created_at desc,id desc limit 100) bounded
$$;
create function factory_cloud.list_jobs(p_owner uuid,p_project uuid) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
begin
  perform factory_cloud.expire_jobs();
  return (select coalesce(jsonb_agg(factory_cloud.job_json(j::factory_cloud.jobs) order by j.created_at,j.id),'[]'::jsonb)
    from (select * from factory_cloud.jobs where owner_id=p_owner and project_id=p_project order by created_at,id limit 1000) j);
end $$;
create function factory_cloud.save_project(p_owner uuid,p_snapshot jsonb) returns boolean
language plpgsql security invoker set search_path = pg_catalog as $$
declare prior factory_cloud.projects; project_id uuid;
begin
  if not factory_cloud.snapshot_ok(p_snapshot,p_owner) then raise exception 'INVALID_INPUT'; end if;
  perform factory_cloud.expire_jobs(); project_id := (p_snapshot->>'id')::uuid;
  if (p_snapshot->>'revision')::integer = 1 then
    insert into factory_cloud.projects(id,owner_id,snapshot) values(project_id,p_owner,p_snapshot) on conflict(id) do nothing;
  end if;
  select * into prior from factory_cloud.projects where id=project_id for update;
  if not found then raise exception 'CONFLICT'; end if;
  if prior.owner_id <> p_owner then raise exception 'NOT_FOUND'; end if;
  if prior.snapshot = p_snapshot then return true; end if;
  if exists(select 1 from factory_cloud.jobs where factory_cloud.jobs.project_id=prior.id and status in ('queued','running'))
    or (p_snapshot->>'revision')::integer <> (prior.snapshot->>'revision')::integer + 1 then raise exception 'CONFLICT'; end if;
  if jsonb_array_length(prior.snapshot->'ideas') > 0 and prior.snapshot->'ideas' <> p_snapshot->'ideas' then raise exception 'CONFLICT'; end if;
  if prior.snapshot->'package' <> 'null'::jsonb and (prior.snapshot->'package' <> p_snapshot->'package'
    or prior.snapshot->'selectedIdeaId' <> p_snapshot->'selectedIdeaId' or prior.snapshot->'brief' <> p_snapshot->'brief') then raise exception 'CONFLICT'; end if;
  update factory_cloud.projects set snapshot=p_snapshot where id=project_id and owner_id=p_owner; return true;
end $$;
create function factory_cloud.enqueue_job(p_owner uuid,p_project uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare p factory_cloud.projects; j factory_cloud.jobs; kind text; selected jsonb;
begin
  perform factory_cloud.expire_jobs();
  select * into p from factory_cloud.projects where id=p_project and owner_id=p_owner for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if (p.snapshot->>'revision')::integer >= 2147483647 then raise exception 'CONFLICT'; end if;
  kind := p_input->>'type';
  if kind not in ('ideas','expand','export') or kind is null then raise exception 'INVALID_INPUT'; end if;
  if exists(select 1 from factory_cloud.jobs where project_id=p_project and status in ('queued','running')) then raise exception 'CONFLICT'; end if;
  if kind in ('ideas','expand') and (not factory_cloud.brief_ok(p_input->'brief') or p_input->'brief' <> p.snapshot->'brief') then raise exception 'CONFLICT'; end if;
  if kind='ideas' then
    if not factory_cloud.keys_ok(p_input,array['type','brief']) then raise exception 'INVALID_INPUT'; end if;
    if jsonb_array_length(p.snapshot->'ideas') <> 0 or p.snapshot->'selectedIdeaId' <> 'null'::jsonb or p.snapshot->'package' <> 'null'::jsonb then raise exception 'CONFLICT'; end if;
  elsif kind='expand' then
    if not factory_cloud.keys_ok(p_input,array['type','brief','selectedIdea']) or not factory_cloud.idea_ok(p_input->'selectedIdea') then raise exception 'INVALID_INPUT'; end if;
    select value into selected from jsonb_array_elements(p.snapshot->'ideas') where value->>'id' = p.snapshot->>'selectedIdeaId';
    if selected is null then raise exception 'SELECTION_REQUIRED'; end if;
    if selected <> p_input->'selectedIdea' or p.snapshot->'package' <> 'null'::jsonb then raise exception 'CONFLICT'; end if;
  else
    if not factory_cloud.keys_ok(p_input,array['type','aspectRatio','sceneIds']) or jsonb_typeof(p_input->'sceneIds') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
    if p.snapshot->'package' = 'null'::jsonb then raise exception 'PACKAGE_REQUIRED'; end if;
    if p_input->>'aspectRatio' is distinct from p.snapshot->'brief'->>'aspectRatio' or p_input->'sceneIds' <>
      (select jsonb_agg(s->'id' order by ord) from jsonb_array_elements(p.snapshot->'package'->'scenes') with ordinality as a(s,ord)) then raise exception 'CONFLICT'; end if;
  end if;
  insert into factory_cloud.jobs(owner_id,project_id,type,target,input,revision)
    values(p_owner,p_project,kind,case when kind='export' then 'local' else 'cloud' end,p_input,(p.snapshot->>'revision')::integer) returning * into j;
  return factory_cloud.job_json(j);
exception when unique_violation then raise exception 'CONFLICT';
end $$;
create function factory_cloud.claim_job(p_worker text,p_target text) returns jsonb
language plpgsql security invoker set search_path = pg_catalog as $$
declare j factory_cloud.jobs;
begin
  if p_worker !~ '^[a-zA-Z0-9_.:-]{1,128}$' or p_target not in ('cloud','local') or p_worker is null or p_target is null then raise exception 'INVALID_INPUT'; end if;
  perform factory_cloud.expire_jobs();
  select * into j from factory_cloud.jobs where status='queued' and target=p_target order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  if not exists(select 1 from factory_cloud.projects p where p.id=j.project_id and p.owner_id=j.owner_id and (p.snapshot->>'revision')::integer=j.revision) then
    update factory_cloud.jobs set status='failed',error_code='CONFLICT',updated_at=clock_timestamp() where id=j.id; return null;
  end if;
  update factory_cloud.jobs set status='running',worker_id=p_worker,fence_token=gen_random_uuid(),lease_expires=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp()
    where id=j.id returning * into j;
  return jsonb_build_object('job',factory_cloud.job_json(j),'input',j.input,'workerId',j.worker_id,'token',j.fence_token,
    'expiresAt',to_char(j.lease_expires at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
end $$;

-- Lease proof includes stored operation/input as well as owner/project/worker/token/revision.
create function factory_cloud.lease_ok(j factory_cloud.jobs,p_owner uuid,p_project uuid,p_worker text,p_token uuid,p_type text,p_target text,p_input jsonb) returns boolean
language sql volatile security invoker set search_path = pg_catalog as $$
  select coalesce(j.status='running' and j.owner_id=p_owner and j.project_id=p_project and j.worker_id=p_worker and j.fence_token=p_token
    and j.lease_expires>clock_timestamp() and j.type=p_type and j.target=p_target and j.input=p_input
    and exists(select 1 from factory_cloud.projects p where p.id=j.project_id and p.owner_id=j.owner_id and (p.snapshot->>'revision')::integer=j.revision),false)
$$;
create function factory_cloud.heartbeat_job(p_job uuid,p_owner uuid,p_project uuid,p_worker text,p_token uuid,p_type text,p_target text,p_input jsonb,p_progress integer) returns boolean
language plpgsql security invoker set search_path = pg_catalog as $$
declare j factory_cloud.jobs;
begin
  if p_progress is null or p_progress not between 0 and 99 then raise exception 'INVALID_INPUT'; end if;
  perform factory_cloud.expire_jobs();
  select * into j from factory_cloud.jobs where id=p_job for update;
  if not found or not factory_cloud.lease_ok(j,p_owner,p_project,p_worker,p_token,p_type,p_target,p_input) then return false; end if;
  update factory_cloud.jobs set progress=greatest(progress,p_progress),lease_expires=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() where id=p_job; return true;
end $$;
create function factory_cloud.complete_job(p_job uuid,p_owner uuid,p_project uuid,p_worker text,p_token uuid,p_type text,p_target text,p_input jsonb,p_result jsonb) returns boolean
language plpgsql security invoker set search_path = pg_catalog as $$
declare j factory_cloud.jobs; p factory_cloud.projects; next_snapshot jsonb;
begin
  perform factory_cloud.expire_jobs();
  select * into p from factory_cloud.projects where id=p_project and owner_id=p_owner for update;
  if not found then return false; end if;
  select * into j from factory_cloud.jobs where id=p_job for update;
  if not found or not factory_cloud.lease_ok(j,p_owner,p_project,p_worker,p_token,p_type,p_target,p_input) then return false; end if;
  next_snapshot := p.snapshot;
  if j.type='ideas' then
    if not factory_cloud.keys_ok(p_result,array['ideas']) or not factory_cloud.ideas_ok(p_result->'ideas') then raise exception 'AI_INVALID_OUTPUT'; end if;
    if jsonb_array_length(p.snapshot->'ideas') <> 0 or p.snapshot->'selectedIdeaId' <> 'null'::jsonb or p.snapshot->'brief' <> j.input->'brief' then raise exception 'CONFLICT'; end if;
    next_snapshot := jsonb_set(next_snapshot,'{ideas}',p_result->'ideas');
  elsif j.type='expand' then
    if not factory_cloud.package_ok(p_result) then raise exception 'AI_INVALID_OUTPUT'; end if;
    if p.snapshot->'package' <> 'null'::jsonb or p.snapshot->>'selectedIdeaId' <> j.input->'selectedIdea'->>'id'
      or p.snapshot->'brief' <> j.input->'brief' or not exists(select 1 from jsonb_array_elements(p.snapshot->'ideas') x where x=j.input->'selectedIdea') then raise exception 'CONFLICT'; end if;
    next_snapshot := jsonb_set(next_snapshot,'{package}',p_result);
  else
    if not factory_cloud.keys_ok(p_result,array['exportId']) or not factory_cloud.text_ok(p_result->'exportId',36,36)
      or p_result->>'exportId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then raise exception 'EXPORT_FAILED'; end if;
    -- Foundation receipt only. A later paired local worker must verify private file/checksum.
  end if;
  next_snapshot := jsonb_set(next_snapshot,'{revision}',to_jsonb(j.revision+1));
  update factory_cloud.projects set snapshot=next_snapshot where id=p_project and owner_id=p_owner;
  update factory_cloud.jobs set status='completed',progress=100,result=p_result,error_code=null,worker_id=null,fence_token=null,lease_expires=null,updated_at=clock_timestamp() where id=p_job;
  return true;
end $$;
create function factory_cloud.fail_job(p_job uuid,p_owner uuid,p_project uuid,p_worker text,p_token uuid,p_type text,p_target text,p_input jsonb,p_error text) returns boolean
language plpgsql security invoker set search_path = pg_catalog as $$
declare j factory_cloud.jobs;
begin
  perform factory_cloud.expire_jobs();
  select * into j from factory_cloud.jobs where id=p_job for update;
  if not found or not factory_cloud.lease_ok(j,p_owner,p_project,p_worker,p_token,p_type,p_target,p_input) then return false; end if;
  if p_error is null or p_error <> all(array['AUTH_REQUIRED','INVALID_CREDENTIALS','ALREADY_CONFIGURED','SETUP_LOCAL_ONLY','INVALID_INPUT','CSRF_INVALID','ORIGIN_FORBIDDEN','RATE_LIMITED','NOT_FOUND','CONFLICT','SELECTION_REQUIRED','IDEAS_REQUIRED','INVALID_SELECTION','PACKAGE_REQUIRED','CLIPS_REQUIRED','INVALID_MEDIA','FILE_TOO_LARGE','AI_NOT_CONFIGURED','AI_REQUEST_FAILED','AI_INVALID_OUTPUT','AI_REFUSED','AI_TIMEOUT','AI_QUOTA_EXCEEDED','AI_RATE_LIMITED','AI_ACCESS_DENIED','MEDIA_TOOL_MISSING','EXPORT_FAILED','INTERRUPTED','INTERNAL_ERROR']) then p_error := 'INTERNAL_ERROR'; end if;
  update factory_cloud.jobs set status='failed',error_code=p_error,worker_id=null,fence_token=null,lease_expires=null,updated_at=clock_timestamp() where id=p_job; return true;
end $$;

revoke all on all functions in schema factory_cloud from public,anon,authenticated;
-- Invoker RPCs need execute on their private helpers; no DELETE, DDL or unrelated-schema grants.
grant execute on all functions in schema factory_cloud to service_role;
commit;
-- Deployment gate: review/test on an isolated approved Postgres instance, run advisors,
-- then separately authorize migration, Data API exposure and server-only credentials.
