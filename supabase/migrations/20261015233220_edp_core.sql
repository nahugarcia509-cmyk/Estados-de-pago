-- No production data or credentials. Apply only after verifying the destination.
create schema if not exists edp_private;
revoke all on schema edp_private from public;
grant usage on schema edp_private to authenticated, service_role;
create table public.edp_organizations(id uuid primary key default gen_random_uuid(), name text not null);
create table public.edp_tenants(id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.edp_organizations, name text not null, unique(id,organization_id));
create table edp_private.memberships(user_id uuid not null references auth.users, tenant_id uuid not null references public.edp_tenants, role text not null check(role in ('vicuna','admin','operator')), primary key(user_id,tenant_id,role));
create table edp_private.platform_admins(user_id uuid primary key references auth.users);
create table edp_private.support_grants(user_id uuid not null references edp_private.platform_admins, tenant_id uuid not null references public.edp_tenants, expires_at timestamptz not null, reason text not null, authorized_by uuid not null references auth.users, primary key(user_id,tenant_id));
create function edp_private.can_access(t uuid, finance boolean default false, writing boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (exists(select 1 from edp_private.memberships m join public.edp_tenants own on own.id=m.tenant_id join public.edp_tenants target on target.id=t where m.user_id=auth.uid() and ((m.tenant_id=t and (not finance or m.role in ('admin','vicuna')) and (not writing or m.role in ('admin','operator'))) or (m.role='vicuna' and own.organization_id=target.organization_id and not writing))) or (not writing and exists(select 1 from edp_private.support_grants g where g.user_id=auth.uid() and g.tenant_id=t and g.expires_at>now())));
$$;
create function edp_private.is_admin(t uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from edp_private.memberships where user_id=auth.uid() and tenant_id=t and role='admin'); $$;
revoke all on all functions in schema edp_private from public;
grant execute on function edp_private.can_access(uuid,boolean,boolean),edp_private.is_admin(uuid) to authenticated;
create function public.edp_my_memberships() returns jsonb language sql stable security definer set search_path='' as $$ select coalesce(jsonb_agg(jsonb_build_object('tenant_id',m.tenant_id,'role',m.role,'tenant_name',t.name,'organization_id',t.organization_id)),'[]') from edp_private.memberships m join public.edp_tenants t on t.id=m.tenant_id where m.user_id=auth.uid(); $$;
revoke all on function public.edp_my_memberships() from public;
grant execute on function public.edp_my_memberships() to authenticated;

create table public.edp_cost_centers(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,name text not null, unique(tenant_id,name),unique(id,tenant_id));
create table public.edp_equipment(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,code text not null,equipment_type text not null,meter_unit text not null default 'unknown' check(meter_unit in ('hours','km','unknown')),unique(tenant_id,code),unique(id,tenant_id));
create table public.edp_aliases(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,original_code text not null,equipment_id uuid not null, foreign key(equipment_id,tenant_id) references public.edp_equipment(id,tenant_id),unique(tenant_id,original_code));
create table public.edp_classifications(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,project text not null,work_area text not null,cost_center_id uuid not null,valid_from date not null,valid_to date,foreign key(cost_center_id,tenant_id) references public.edp_cost_centers(id,tenant_id), check(valid_to is null or valid_to>=valid_from), unique(tenant_id,project,work_area,valid_from));
create table public.edp_rates(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,equipment_id uuid not null,valid_from date not null,valid_to date,normal numeric(18,4) not null check(normal>=0),extra numeric(18,4) not null check(extra>=0),od numeric(18,4) not null check(od>=0),fs numeric(18,4) not null check(fs>=0),mobilization numeric(18,4) not null check(mobilization>=0),demobilization numeric(18,4) not null check(demobilization>=0),demonstration boolean not null default true,raw jsonb not null default '{}',created_at timestamptz not null default now(),foreign key(equipment_id,tenant_id) references public.edp_equipment(id,tenant_id),check(valid_to is null or valid_to>=valid_from),unique(id,tenant_id),unique(tenant_id,equipment_id,valid_from));
create table public.edp_rules(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,component text not null check(component in ('normal','extra','od','fs','mobilization','demobilization')),unit text not null,description text not null,demonstration boolean not null default true,approved_by uuid references auth.users,created_at timestamptz not null default now(),unique(id,tenant_id));
create table public.edp_periods(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,start_date date not null,end_date date not null,status text not null default 'draft' check(status in ('draft','review','approved','closed')),notes text not null default '',closed_at timestamptz,unique(id,tenant_id),unique(tenant_id,start_date),check(extract(day from start_date)=26 and end_date=(start_date+interval '1 month'-interval '1 day')::date));
create table public.edp_reports_data(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,work_date date not null,equipment_id uuid,equipment_original text not null,operator text not null,supervisor text not null default '',client_supervisor text not null default '',shift text not null,report_number text not null,project text not null default '',work_area text not null default '',cost_center_id uuid,meter_start numeric(18,3),meter_end numeric(18,3),reported_hours numeric(18,3) check(reported_hours>=0),operational_status text not null default '',fuel text,oil text,tasks jsonb not null default '[]',wear text,notes text not null default '',raw jsonb not null,issues text[] not null default '{}',validation text not null default 'pending' check(validation in ('pending','approved','rejected')),origin text not null check(origin in ('app','sheets')),source_id uuid,external_id text,source_version bigint,content_hash text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid references auth.users,foreign key(equipment_id,tenant_id) references public.edp_equipment(id,tenant_id),foreign key(cost_center_id,tenant_id) references public.edp_cost_centers(id,tenant_id),unique(id,tenant_id),unique(tenant_id,source_id,external_id),unique(tenant_id,work_date,equipment_original,shift,report_number),check(origin='app' or (source_id is not null and external_id is not null)));
create table public.edp_billables(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,report_id uuid,period_id uuid not null,rate_id uuid not null,rule_id uuid not null,equipment_id uuid not null,cost_center_id uuid not null,event_date date not null,component text not null check(component in ('normal','extra','od','fs','mobilization','demobilization')),quantity numeric(18,3) not null check(quantity>=0),rate_snapshot numeric(18,4) not null check(rate_snapshot>=0),amount numeric(20,2) generated always as (round(quantity*rate_snapshot,2)) stored,reason text not null,approved_by uuid not null references auth.users,created_at timestamptz not null default now(),foreign key(report_id,tenant_id) references public.edp_reports_data(id,tenant_id),foreign key(period_id,tenant_id) references public.edp_periods(id,tenant_id),foreign key(rate_id,tenant_id) references public.edp_rates(id,tenant_id),foreign key(rule_id,tenant_id) references public.edp_rules(id,tenant_id),foreign key(equipment_id,tenant_id) references public.edp_equipment(id,tenant_id),foreign key(cost_center_id,tenant_id) references public.edp_cost_centers(id,tenant_id),unique(report_id,component),check((component in ('mobilization','demobilization') and report_id is null) or (component not in ('mobilization','demobilization') and report_id is not null)));
create table public.edp_adjustments(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,period_id uuid not null,amount numeric(20,2) not null,reason text not null check(length(reason)>5),approved_by uuid not null references auth.users,created_at timestamptz not null default now(),foreign key(period_id,tenant_id) references public.edp_periods(id,tenant_id));
create table public.edp_sync_sources(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,spreadsheet_id text not null,mode text not null default 'push' check(mode in ('push','pull')),enabled boolean not null default false,last_sync_at timestamptz,cursor bigint not null default 0,unique(id,tenant_id),unique(tenant_id,spreadsheet_id));
create table edp_private.source_secrets(source_id uuid primary key references public.edp_sync_sources,secret text not null check(length(secret)>=32));
create table public.edp_sync_runs(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,source_id uuid not null,batch_id uuid not null,status text not null check(status in ('ok','error')),processed integer not null default 0,error text,created_at timestamptz not null default now(),foreign key(source_id,tenant_id) references public.edp_sync_sources(id,tenant_id),unique(source_id,batch_id));
create table public.edp_audit(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,actor uuid,action text not null,entity text not null,record_id uuid,old_data jsonb,new_data jsonb,created_at timestamptz not null default now());
create unique index edp_reports_canonical_dedup on public.edp_reports_data(tenant_id,work_date,equipment_id,shift,report_number) where equipment_id is not null;
create index edp_reports_tenant_date on public.edp_reports_data(tenant_id,work_date,equipment_id,cost_center_id);
create index edp_billables_period on public.edp_billables(tenant_id,period_id,event_date);
create index edp_audit_date on public.edp_audit(tenant_id,created_at desc);
create index edp_memberships_user on edp_private.memberships(user_id);

-- A period row is the common lock for imports, operational writes and closing.
create function edp_private.period_lock(t uuid,d date) returns uuid language plpgsql set search_path='' as $$
declare s date; p uuid; st text;
begin
 s:=case when extract(day from d)>=26 then date_trunc('month',d)::date+25 else (date_trunc('month',d)-interval '1 month')::date+25 end;
 insert into public.edp_periods(tenant_id,start_date,end_date) values(t,s,(s+interval '1 month'-interval '1 day')::date) on conflict(tenant_id,start_date) do nothing;
 select id,status into p,st from public.edp_periods where tenant_id=t and start_date=s for update;
 if st in ('approved','closed') then raise exception 'Período aprobado/cerrado: registrar ajuste trazable';end if;
 return p;
end;$$;
create function edp_private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin v:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.edp_audit(tenant_id,actor,action,entity,record_id,old_data,new_data) values((v->>'tenant_id')::uuid,auth.uid(),TG_OP,TG_TABLE_NAME,(v->>'id')::uuid,case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);return null;end;$$;
create function edp_private.report_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if (new.tenant_id,new.origin,new.source_id,new.external_id,new.created_by,new.created_at) is distinct from (old.tenant_id,old.origin,old.source_id,old.external_id,old.created_by,old.created_at) then raise exception 'Identidad de origen inmutable';end if;
  perform edp_private.period_lock(old.tenant_id,old.work_date);
  if exists(select 1 from public.edp_billables where report_id=old.id) then raise exception 'Parte facturado inmutable; requiere ajuste';end if;
 end if;
 perform edp_private.period_lock(new.tenant_id,new.work_date);
 new.updated_at:=now();return new;
end;$$;
alter table public.edp_reports_data add column classification_override boolean not null default false;
create trigger edp_report_guard before insert or update on public.edp_reports_data for each row execute function edp_private.report_guard();
create function edp_private.rate_guard() returns trigger language plpgsql set search_path='' as $$
begin
 perform 1 from public.edp_equipment where id=new.equipment_id for update;
 if TG_OP='UPDATE' then raise exception 'Tarifa inmutable: agregar otra versión';end if;
 if exists(select 1 from public.edp_rates where equipment_id=new.equipment_id and daterange(valid_from,valid_to,'[]') && daterange(new.valid_from,new.valid_to,'[]')) then raise exception 'Vigencias de tarifa superpuestas';end if;
 return new;
end;$$;
create trigger edp_rate_guard before insert or update on public.edp_rates for each row execute function edp_private.rate_guard();

-- All client writes use narrow RPCs. No grants for direct INSERT/UPDATE/DELETE.
do $$ declare n text; financial boolean; begin
 foreach n in array array['cost_centers','equipment','aliases','classifications','rates','rules','periods','reports_data','billables','adjustments','sync_sources','sync_runs','audit'] loop
  financial:=n in ('rates','rules','periods','billables','adjustments','sync_sources','sync_runs','audit');
  execute format('alter table public.edp_%I enable row level security',n);
  execute format('revoke all on public.edp_%I from anon,authenticated',n);
  execute format('grant select on public.edp_%I to authenticated',n);
  execute format('grant all on public.edp_%I to service_role',n);
  execute format('create policy tenant_read on public.edp_%I for select to authenticated using(edp_private.can_access(tenant_id,%L,false))',n,financial);
  if n<>'audit' then execute format('create trigger audit_change after insert or update or delete on public.edp_%I for each row execute function edp_private.audit_change()',n);end if;
 end loop;
end $$;
alter table public.edp_tenants enable row level security;
alter table public.edp_organizations enable row level security;
revoke all on public.edp_tenants,public.edp_organizations from anon,authenticated;
grant select on public.edp_tenants,public.edp_organizations to authenticated;
grant all on public.edp_tenants,public.edp_organizations to service_role;
create policy read_tenants on public.edp_tenants for select to authenticated using(edp_private.can_access(id));
create policy read_organizations on public.edp_organizations for select to authenticated using(exists(select 1 from public.edp_tenants t where t.organization_id=edp_organizations.id));
alter table edp_private.memberships enable row level security;
alter table edp_private.platform_admins enable row level security;
alter table edp_private.support_grants enable row level security;
alter table edp_private.source_secrets enable row level security;
revoke all on all tables in schema edp_private from public,anon,authenticated;
grant all on all tables in schema edp_private to service_role;

 create function edp_private.create_report(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; e public.edp_equipment; rid uuid;
begin
 if auth.uid() is null then raise exception 'Autenticación requerida';end if;
 select * into e from public.edp_equipment where id=(payload->>'equipment_id')::uuid;
 t:=e.tenant_id;
 if t is null or not edp_private.can_access(t,false,true) then raise exception 'Sin permiso para este equipo';end if;
 insert into public.edp_reports_data(tenant_id,work_date,equipment_id,equipment_original,operator,supervisor,client_supervisor,shift,report_number,project,work_area,cost_center_id,meter_start,meter_end,reported_hours,operational_status,fuel,oil,tasks,wear,notes,raw,origin,created_by,issues)
 values(t,(payload->>'work_date')::date,e.id,e.code,payload->>'operator',coalesce(payload->>'supervisor',''),coalesce(payload->>'client_supervisor',''),payload->>'shift',payload->>'report_number',coalesce(payload->>'project',''),coalesce(payload->>'work_area',''),nullif(payload->>'cost_center_id','')::uuid,nullif(payload->>'meter_start','')::numeric,nullif(payload->>'meter_end','')::numeric,nullif(payload->>'reported_hours','')::numeric,coalesce(payload->>'operational_status',''),payload->>'fuel',payload->>'oil',coalesce(payload->'tasks','[]'),payload->>'wear',coalesce(payload->>'notes',''),payload,'app',auth.uid(),array_remove(array[case when nullif(payload->>'cost_center_id','') is null then 'Sin clasificación contractual' end,case when e.meter_unit='unknown' then 'Unidad de medición pendiente' end,case when (payload->>'meter_end')::numeric<(payload->>'meter_start')::numeric then 'Medidor decreciente' end],null)) returning id into rid;
 return rid;
end;$$;
create function public.edp_create_report(payload jsonb) returns uuid language sql security invoker set search_path='' as $$select edp_private.create_report(payload);$$;

create function edp_private.add_billable(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.edp_reports_data; rt public.edp_rates; rule public.edp_rules; p uuid; component_name text:=payload->>'component'; result uuid; price numeric; e uuid; t uuid; d date; cc uuid;
begin
 if auth.uid() is null then raise exception 'Autenticación requerida';end if;
 select * into rt from public.edp_rates where id=(payload->>'rate_id')::uuid;
 t:=rt.tenant_id;e:=rt.equipment_id;
 if not coalesce(edp_private.is_admin(t),false) then raise exception 'Solo administrador contratista';end if;
 select * into rule from public.edp_rules where id=(payload->>'rule_id')::uuid and tenant_id=t and component=component_name and approved_by is not null;
 if rule.id is null then raise exception 'Regla contractual sin aprobar/configurar';end if; if component_name in ('normal','extra') and rule.unit<>'hours' then raise exception 'Unidad de regla incompatible con horas';end if;
 if component_name in ('mobilization','demobilization') then
  d:=(payload->>'event_date')::date;cc:=(payload->>'cost_center_id')::uuid;
 else
  select * into r from public.edp_reports_data where id=(payload->>'report_id')::uuid and tenant_id=t for update;
  if r.id is null or r.equipment_id<>e or r.cost_center_id is null or cardinality(r.issues)>0 then raise exception 'Parte sin clasificación o con inconsistencias';end if;
  if (component_name in ('normal','extra')) and (select meter_unit from public.edp_equipment where id=e)<>'hours' then raise exception 'No convertir km/unidad desconocida en horas';end if;
  if (component_name='od' and r.operational_status<>'OD') or (component_name='fs' and r.operational_status<>'FS') then raise exception 'Estado OD/FS incompatible';end if;
  d:=r.work_date;cc:=r.cost_center_id;
 end if;
 if not (d>=rt.valid_from and (rt.valid_to is null or d<=rt.valid_to)) then raise exception 'Tarifa fuera de vigencia';end if;
 if length(coalesce(payload->>'reason',''))<6 then raise exception 'Justificación obligatoria';end if;
 p:=edp_private.period_lock(t,d);
 price:=case component_name when 'normal' then rt.normal when 'extra' then rt.extra when 'od' then rt.od when 'fs' then rt.fs when 'mobilization' then rt.mobilization when 'demobilization' then rt.demobilization end;
 if price is null then raise exception 'Concepto inválido';end if;
 if r.id is not null and r.validation<>'approved' then update public.edp_reports_data set validation='approved' where id=r.id;end if;
 insert into public.edp_billables(tenant_id,report_id,period_id,rate_id,rule_id,equipment_id,cost_center_id,event_date,component,quantity,rate_snapshot,reason,approved_by,rule_snapshot,demonstration) values(t,r.id,p,rt.id,rule.id,e,cc,d,component_name,(payload->>'quantity')::numeric,price,payload->>'reason',auth.uid(),to_jsonb(rule),rt.demonstration or rule.demonstration) returning id into result;
 return result;
end;$$;
create function public.edp_add_billable(payload jsonb) returns uuid language sql security invoker set search_path='' as $$select edp_private.add_billable(payload);$$;
create function edp_private.transition_period(period uuid,new_status text,observation text) returns void language plpgsql security definer set search_path='' as $$
declare p public.edp_periods;
begin
 select * into p from public.edp_periods where id=period for update;
 if not coalesce(edp_private.is_admin(p.tenant_id),false) then raise exception 'Sin permiso';end if;
 if not ((p.status='draft' and new_status='review') or (p.status='review' and new_status in ('draft','approved')) or (p.status='approved' and new_status='closed')) then raise exception 'Transición inválida';end if;
 if new_status in ('approved','closed') and exists(select 1 from public.edp_reports_data where tenant_id=p.tenant_id and work_date between p.start_date and p.end_date and validation='pending') then raise exception 'Hay partes pendientes';end if;
 update public.edp_periods set status=new_status,notes=coalesce(observation,''),closed_at=case when new_status='closed' then now() end where id=period;
end;$$;
create function public.edp_transition_period(period uuid,new_status text,observation text) returns void language sql security invoker set search_path='' as $$select edp_private.transition_period(period,new_status,observation);$$;
create function edp_private.add_adjustment(period uuid,value numeric,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.edp_periods; result uuid;
begin select * into p from public.edp_periods where id=period for update;
 if not coalesce(edp_private.is_admin(p.tenant_id),false) then raise exception 'Sin permiso';end if;
 insert into public.edp_adjustments(tenant_id,period_id,amount,reason,approved_by) values(p.tenant_id,p.id,value,reason,auth.uid()) returning id into result;return result;
end;$$;
create function public.edp_add_adjustment(period uuid,value numeric,reason text) returns uuid language sql security invoker set search_path='' as $$ select edp_private.add_adjustment(period,value,reason);$$;
-- Immutable historical rules and rates; dates must be bounded when initially created.
create function edp_private.add_rate(payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid; result uuid;
begin select tenant_id into t from public.edp_equipment where id=(payload->>'equipment_id')::uuid;
 if not coalesce(edp_private.is_admin(t),false) then raise exception 'Sin permiso';end if;
 insert into public.edp_rates(tenant_id,equipment_id,valid_from,valid_to,normal,extra,od,fs,mobilization,demobilization,demonstration) values(t,(payload->>'equipment_id')::uuid,(payload->>'valid_from')::date,nullif(payload->>'valid_to','')::date,(payload->>'normal')::numeric,(payload->>'extra')::numeric,(payload->>'od')::numeric,(payload->>'fs')::numeric,(payload->>'mobilization')::numeric,(payload->>'demobilization')::numeric,true) returning id into result;return result;end;$$;
create function public.edp_add_rate(payload jsonb) returns uuid language sql security invoker set search_path='' as $$select edp_private.add_rate(payload);$$;

-- Private helpers have explicit grants; no anonymous RPC paths.
revoke all on all functions in schema edp_private from public;
grant execute on function edp_private.can_access(uuid,boolean,boolean),edp_private.is_admin(uuid),edp_private.create_report(jsonb),edp_private.add_billable(jsonb),edp_private.transition_period(uuid,text,text),edp_private.add_adjustment(uuid,numeric,text),edp_private.add_rate(jsonb) to authenticated;
revoke all on function public.edp_create_report(jsonb),public.edp_add_billable(jsonb),public.edp_transition_period(uuid,text,text),public.edp_add_adjustment(uuid,numeric,text),public.edp_add_rate(jsonb) from public;
grant execute on function public.edp_create_report(jsonb),public.edp_add_billable(jsonb),public.edp_transition_period(uuid,text,text),public.edp_add_adjustment(uuid,numeric,text),public.edp_add_rate(jsonb) to authenticated;



create view public.edp_daily with(security_invoker=true) as
 select r.*,t.name tenant_name,e.equipment_type,c.name cost_center_name,
 case when e.meter_unit='hours' then r.meter_end-r.meter_start end hour_difference,
 case when e.meter_unit='km' then r.meter_end-r.meter_start end odometer_difference
 from public.edp_reports_data r join public.edp_tenants t on t.id=r.tenant_id left join public.edp_equipment e on e.id=r.equipment_id left join public.edp_cost_centers c on c.id=r.cost_center_id;
revoke all on public.edp_daily from public,anon;
grant select on public.edp_daily to authenticated,service_role;
create function public.edp_filtered_reports(filters jsonb) returns setof public.edp_daily language sql stable security invoker set search_path='' as $$
 select r.* from public.edp_daily r where
 (nullif(filters->>'tenant','') is null or r.tenant_id=(filters->>'tenant')::uuid)
 and r.work_date between (filters->>'from')::date and (filters->>'to')::date
 and (nullif(filters->>'equipment','') is null or r.equipment_id=(filters->>'equipment')::uuid)
 and (nullif(filters->>'cost_center','') is null or r.cost_center_id=(filters->>'cost_center')::uuid)
 and (nullif(filters->>'project','') is null or r.project=filters->>'project')
 and (nullif(filters->>'equipment_type','') is null or r.equipment_type=filters->>'equipment_type')
 and (nullif(filters->>'shift','') is null or r.shift=filters->>'shift')
 and (nullif(filters->>'operational_status','') is null or r.operational_status=filters->>'operational_status')
 and (nullif(filters->>'validation','') is null or r.validation=filters->>'validation')
 and (nullif(filters->>'search','') is null or position(lower(filters->>'search') in lower(r.equipment_original))>0);
$$;
create function public.edp_reports(filters jsonb,page_number integer default 0,sort_column text default 'work_date',sort_ascending boolean default false) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if page_number<0 or page_number>100000 then raise exception 'Página inválida';end if;
 if sort_column not in ('work_date','equipment_original','operator','report_number','shift','validation','project','tenant_name') then raise exception 'Orden no permitido';end if;
 execute format($query$
 with filtered as materialized(select * from public.edp_filtered_reports($1)),
 page as (select * from filtered order by %I %s,id limit 50 offset $2)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)||case when edp_private.can_access(page.tenant_id,true,false) then jsonb_build_object(
 'approved_hours',(select coalesce(sum(quantity),0)::text from public.edp_billables b where b.report_id=page.id and b.component in ('normal','extra')),
 'amount',(select coalesce(sum(amount),0)::text from public.edp_billables b where b.report_id=page.id),
 'applied_rates',coalesce((select jsonb_agg(jsonb_build_object('component',component,'quantity',quantity::text,'rate',rate_snapshot::text,'amount',amount::text,'demonstration',demonstration)) from public.edp_billables b where b.report_id=page.id),'[]')) else '{}'::jsonb end) from page),'[]'),'total',(select count(*) from filtered))
 $query$,sort_column,case when sort_ascending then 'asc' else 'desc' end) into result using filters,page_number*50;
 return result;end;$$;
create function public.edp_summary(filters jsonb) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;begin
 if auth.uid() is null or not exists(select 1 from public.edp_tenants where edp_private.can_access(id,true,false)) then raise exception 'Sin permiso financiero';end if;
 with r as materialized(select * from public.edp_filtered_reports(filters)),
 b as materialized(
  select b.*,e.code,e.equipment_type,c.name center_name from public.edp_billables b join public.edp_equipment e on e.id=b.equipment_id join public.edp_cost_centers c on c.id=b.cost_center_id
  where (nullif(filters->>'tenant','') is null or b.tenant_id=(filters->>'tenant')::uuid)
  and b.event_date between (filters->>'from')::date and (filters->>'to')::date
  and (b.report_id in(select id from r) or (b.report_id is null
    and (nullif(filters->>'equipment','') is null or b.equipment_id=(filters->>'equipment')::uuid)
    and (nullif(filters->>'cost_center','') is null or b.cost_center_id=(filters->>'cost_center')::uuid)
    and (nullif(filters->>'equipment_type','') is null or e.equipment_type=filters->>'equipment_type')
    and (nullif(filters->>'search','') is null or position(lower(filters->>'search') in lower(e.code))>0)
    and nullif(filters->>'project','') is null and nullif(filters->>'shift','') is null and nullif(filters->>'operational_status','') is null and nullif(filters->>'validation','') is null))),
 adjustments as (select coalesce(sum(a.amount),0) amount from public.edp_adjustments a join public.edp_periods p on p.id=a.period_id where (nullif(filters->>'tenant','') is null or a.tenant_id=(filters->>'tenant')::uuid) and p.start_date>=(filters->>'from')::date and p.end_date<=(filters->>'to')::date and not exists(select 1 from jsonb_each_text(filters) where key in ('equipment','cost_center','project','shift','equipment_type','operational_status','validation','search') and nullif(value,'') is not null)),
 daily as(select d::date date,coalesce((select sum(amount) from b where event_date=d::date),0) amount,coalesce((select sum(quantity) from b where event_date=d::date and component in ('normal','extra')),0) hours from generate_series((filters->>'from')::date,(filters->>'to')::date,interval '1 day') d)
 select jsonb_build_object('total',((select coalesce(sum(amount),0) from b)+(select amount from adjustments))::text,'adjustments',(select amount::text from adjustments),'hours',(select coalesce(sum(quantity),0)::text from b where component in ('normal','extra')),'equipment_count',(select count(distinct equipment_id) from r),'pending',(select count(*) from r where validation='pending'),'components',coalesce((select jsonb_agg(x) from(select component,sum(amount)::text amount from b group by component)x),'[]'),'daily',coalesce((select jsonb_agg(jsonb_build_object('date',date,'amount',amount::text,'hours',hours::text) order by date) from daily),'[]'),'centers',coalesce((select jsonb_agg(x) from(select center_name name,sum(amount)::text amount from b group by center_name)x),'[]'),'ranking',coalesce((select jsonb_agg(x) from(select code name,sum(amount)::text amount from b group by code order by sum(amount) desc limit 10)x),'[]'),'types',coalesce((select jsonb_agg(x) from(select equipment_type name,sum(amount)::text amount from b group by equipment_type)x),'[]')) into result;
 return result;end;$$;
revoke all on function public.edp_filtered_reports(jsonb),public.edp_reports(jsonb,integer,text,boolean),public.edp_summary(jsonb) from public;
grant execute on function public.edp_filtered_reports(jsonb),public.edp_reports(jsonb,integer,text,boolean),public.edp_summary(jsonb) to authenticated;

alter table public.edp_sync_sources add column wbs_valid_from date;
alter table public.edp_sync_sources add column wbs_valid_to date;
create table public.edp_import_staging(id uuid primary key default gen_random_uuid(),tenant_id uuid not null references public.edp_tenants,source_id uuid not null,external_id text not null,kind text not null,source_version bigint not null,raw jsonb not null,content_hash text not null,status text not null default 'pending',issues text[] not null default '{}',foreign key(source_id,tenant_id) references public.edp_sync_sources(id,tenant_id),unique(source_id,kind,external_id));
alter table public.edp_import_staging enable row level security;
revoke all on public.edp_import_staging from public,anon,authenticated;
grant select on public.edp_import_staging to authenticated;
grant all on public.edp_import_staging to service_role;
create policy staging_read on public.edp_import_staging for select to authenticated using(edp_private.is_admin(tenant_id));
create trigger audit_change after insert or update or delete on public.edp_import_staging for each row execute function edp_private.audit_change();
create function public.edp_source_backend(source uuid) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(s)||jsonb_build_object('secret',k.secret) from public.edp_sync_sources s join edp_private.source_secrets k on k.source_id=s.id where s.id=source and s.enabled;$$;
revoke all on function public.edp_source_backend(uuid) from public,anon,authenticated;
grant execute on function public.edp_source_backend(uuid) to service_role;
create function public.edp_can_sync(source uuid) returns boolean language sql security invoker set search_path='' as $$select coalesce((select edp_private.is_admin(tenant_id) from public.edp_sync_sources where id=source),false);$$;
revoke all on function public.edp_can_sync(uuid) from public;
grant execute on function public.edp_can_sync(uuid) to authenticated;

create function public.edp_ingest_batch(source uuid,batch uuid,entries jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.edp_sync_sources; item jsonb; raw jsonb; h text; v bigint; ext text; entry_kind text; e public.edp_equipment; cc uuid; rid uuid; existing public.edp_import_staging; processed integer:=0; d date; problems text[]; report public.edp_reports_data;
begin
 if jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>100 then raise exception 'Lote inválido';end if;
 -- Transaction lock serializes imports from this source. Concurrent retry returns same result.
 if not pg_try_advisory_xact_lock(hashtext(source::text)) then raise exception 'Sincronización en curso: reintentar';end if;
 select * into s from public.edp_sync_sources where id=source and enabled for update;
 if s.id is null then raise exception 'Fuente deshabilitada';end if;
 if exists(select 1 from public.edp_sync_runs where source_id=source and batch_id=batch and status='ok') then return jsonb_build_object('duplicate',true,'processed',0);end if;
 for item in select value from jsonb_array_elements(entries) loop
  raw:=item->'raw';h:=item->>'hash';v:=(item->>'version')::bigint;ext:=item->>'external_id';entry_kind:=item->>'kind';problems:='{}';cc:=null;rid:=null;e:=null;report:=null;
  if ext is null or ext='' or v<1 or h is null or entry_kind not in ('report','wbs') then raise exception 'Entrada inválida';end if;
  select * into existing from public.edp_import_staging where source_id=source and external_id=ext and edp_import_staging.kind=entry_kind for update;
  if existing.source_version>=v then continue;end if;
  if existing.content_hash=h then update public.edp_import_staging set source_version=v where id=existing.id;continue;end if;
  if entry_kind='wbs' then
   select * into e from public.edp_equipment where tenant_id=s.tenant_id and code=raw->>'Equipo';
   if e.id is null then insert into public.edp_equipment(tenant_id,code,equipment_type) values(s.tenant_id,raw->>'Equipo',raw->>'tipo equipo') returning * into e;end if;
   insert into public.edp_cost_centers(tenant_id,name) values(s.tenant_id,raw->>'Centro de costo') on conflict(tenant_id,name) do nothing;
   if s.wbs_valid_from is null or s.wbs_valid_to is null then problems:=array_append(problems,'Definir vigencia WBS explícita antes de crear tarifas');
   elsif existing.id is not null then problems:=array_append(problems,'Cambio WBS: crear nueva versión autorizada; no reescribe tarifas');
   else insert into public.edp_rates(tenant_id,equipment_id,valid_from,valid_to,normal,extra,mobilization,demobilization,od,fs,raw,demonstration) values(s.tenant_id,e.id,s.wbs_valid_from,s.wbs_valid_to,(raw->>'Costo de hora')::numeric,(raw->>'Costo de hora extra')::numeric,(raw->>'Costo de movilizacion')::numeric,(raw->>'Costo de desmovilizacion')::numeric,(raw->>'Costo de OD')::numeric,(raw->>'Costo FS')::numeric,raw,true);end if;
  else
   d:=to_date(raw->>'Fecha','DD/MM/YYYY'); select * into report from public.edp_reports_data where tenant_id=s.tenant_id and source_id=source and external_id=ext;
   if to_char(d,'DD/MM/YYYY')<>raw->>'Fecha' then raise exception 'Fecha inválida';end if;
   select * into e from public.edp_equipment where tenant_id=s.tenant_id and code=raw->>'Interno';
   if e.id is null then select eq.* into e from public.edp_aliases a join public.edp_equipment eq on eq.id=a.equipment_id where a.tenant_id=s.tenant_id and a.original_code=raw->>'Interno';end if;
   if e.id is null then problems:=array_append(problems,'Equipo sin alias validado');elsif e.meter_unit='unknown' then problems:=array_append(problems,'Unidad de medición pendiente');end if;
   if (select count(*) from public.edp_classifications where tenant_id=s.tenant_id and project=raw->>'Proyecto ' and work_area=raw->>'Area de trabajo' and d>=valid_from and (valid_to is null or d<=valid_to))=1 then
    select cost_center_id into cc from public.edp_classifications where tenant_id=s.tenant_id and project=raw->>'Proyecto ' and work_area=raw->>'Area de trabajo' and d>=valid_from and (valid_to is null or d<=valid_to);
   end if;
   if report.classification_override and report.project=raw->>'Proyecto ' and report.work_area=raw->>'Area de trabajo' and report.equipment_original=raw->>'Interno' then cc:=report.cost_center_id;end if; if cc is null then problems:=array_append(problems,'Sin clasificación contractual inequívoca');end if;
   if (raw->>'Horómetro final')::numeric<(raw->>'Horómetro inicial')::numeric then problems:=array_append(problems,'Medidor decreciente');end if;
   if e.meter_unit='hours' and (raw->>'Horómetro final')::numeric-(raw->>'Horómetro inicial')::numeric<>(raw->>'Cant. Hs.')::numeric then problems:=array_append(problems,'Diferencia entre horas informadas y medidor');end if;
   select * into report from public.edp_reports_data where tenant_id=s.tenant_id and source_id=source and external_id=ext;
   if report.id is not null and (report.validation<>'pending' or exists(select 1 from public.edp_billables where report_id=report.id)) then problems:=array_append(problems,'Cambio sobre parte validado: requiere ajuste/revisión');
   elsif exists(select 1 from public.edp_periods where tenant_id=s.tenant_id and d between start_date and end_date and status in ('approved','closed')) then problems:=array_append(problems,'Cambio sobre período aprobado/cerrado: requiere ajuste');
   else
    insert into public.edp_reports_data(tenant_id,work_date,equipment_id,equipment_original,operator,supervisor,client_supervisor,shift,report_number,project,work_area,cost_center_id,meter_start,meter_end,reported_hours,operational_status,fuel,oil,tasks,wear,notes,raw,issues,origin,source_id,external_id,source_version,content_hash)
    values(s.tenant_id,d,e.id,raw->>'Interno',raw->>'Operador',coalesce(raw->>'Supervisor Delta',''),coalesce(raw->>'Supervisor Vial Cliente',''),raw->>'Turno de trabajo',raw->>'N° Parte',coalesce(raw->>'Proyecto ',''),coalesce(raw->>'Area de trabajo',''),cc,(raw->>'Horómetro inicial')::numeric,(raw->>'Horómetro final')::numeric,(raw->>'Cant. Hs.')::numeric,coalesce(raw->>'OD o FS',''),raw->>'Combustible',raw->>'Aceite',jsonb_build_array(raw->>'Tarea 1',raw->>'Tarea 2'),raw->>'Información sobre Desgaste',concat_ws(E'\n',raw->>'Observaciones 1',raw->>'Observaciones 2'),raw,problems,'sheets',source,ext,v,h)
    on conflict(tenant_id,source_id,external_id) do update set work_date=excluded.work_date,equipment_id=excluded.equipment_id,equipment_original=excluded.equipment_original,operator=excluded.operator,supervisor=excluded.supervisor,client_supervisor=excluded.client_supervisor,shift=excluded.shift,report_number=excluded.report_number,project=excluded.project,work_area=excluded.work_area,cost_center_id=excluded.cost_center_id,classification_override=edp_reports_data.classification_override and edp_reports_data.project=excluded.project and edp_reports_data.work_area=excluded.work_area and edp_reports_data.equipment_original=excluded.equipment_original,meter_start=excluded.meter_start,meter_end=excluded.meter_end,reported_hours=excluded.reported_hours,operational_status=excluded.operational_status,fuel=excluded.fuel,oil=excluded.oil,tasks=excluded.tasks,wear=excluded.wear,notes=excluded.notes,raw=excluded.raw,issues=excluded.issues,source_version=excluded.source_version,content_hash=excluded.content_hash;
   end if;
  end if;
  insert into public.edp_import_staging(tenant_id,source_id,external_id,kind,source_version,raw,content_hash,status,issues) values(s.tenant_id,source,ext,entry_kind,v,raw,h,case when cardinality(problems)=0 then 'imported' else 'review' end,problems)
  on conflict(source_id,kind,external_id) do update set source_version=excluded.source_version,raw=excluded.raw,content_hash=excluded.content_hash,status=excluded.status,issues=excluded.issues;
  processed:=processed+1;
 end loop;
 update public.edp_sync_sources set last_sync_at=now(),cursor=greatest(cursor,coalesce((select max((value->>'version')::bigint) from jsonb_array_elements(entries)),0)) where id=source;
 insert into public.edp_sync_runs(tenant_id,source_id,batch_id,status,processed) values(s.tenant_id,source,batch,'ok',processed) on conflict(source_id,batch_id) do update set status='ok',processed=excluded.processed,error=null;
 return jsonb_build_object('processed',processed);
end;$$;
revoke all on function public.edp_ingest_batch(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.edp_ingest_batch(uuid,uuid,jsonb) to service_role;


alter table public.edp_billables add column rule_snapshot jsonb not null default '{}';
alter table public.edp_billables add column demonstration boolean not null default true;
create function edp_private.reject_report(report uuid,reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.edp_reports_data;
begin select * into r from public.edp_reports_data where id=report for update;
 if not coalesce(edp_private.is_admin(r.tenant_id),false) or length(coalesce(reason,''))<6 then raise exception 'Sin permiso o justificación insuficiente';end if;
 update public.edp_reports_data set validation='rejected',notes=notes||E'\nRechazo: '||reason where id=r.id;
end;$$;
create function public.edp_reject_report(report uuid,reason text) returns void language sql security invoker set search_path='' as $$select edp_private.reject_report(report,reason);$$;
revoke all on function edp_private.reject_report(uuid,text),public.edp_reject_report(uuid,text) from public;
grant execute on function edp_private.reject_report(uuid,text),public.edp_reject_report(uuid,text) to authenticated;
-- Record authorized support access grants; platform admins have no implicit client access.
create function edp_private.audit_support() returns trigger language plpgsql security definer set search_path='' as $$
declare v jsonb;begin v:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
insert into public.edp_audit(tenant_id,actor,action,entity,old_data,new_data) values((v->>'tenant_id')::uuid,auth.uid(),TG_OP,'support_grants',case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end);return null;end;$$;
revoke all on function edp_private.audit_support() from public;
create trigger support_grant_audit after insert or update or delete on edp_private.support_grants for each row execute function edp_private.audit_support();
create function edp_private.classify_report(report uuid,equipment uuid,center uuid,meter_unit text,reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.edp_reports_data;e public.edp_equipment; problems text[]:='{}';
begin
 select * into r from public.edp_reports_data where id=report for update;
 if not coalesce(edp_private.is_admin(r.tenant_id),false) or length(coalesce(reason,''))<6 then raise exception 'Sin permiso o falta justificación';end if;
 select * into e from public.edp_equipment where id=equipment and tenant_id=r.tenant_id;
 if e.id is null or not exists(select 1 from public.edp_cost_centers where id=center and tenant_id=r.tenant_id) then raise exception 'Equipo/centro ajeno';end if;
 if meter_unit not in ('hours','km','unknown') then raise exception 'Unidad inválida';end if;
 -- Do not reinterpret previously recognized quantities when changing a master unit.
 if e.meter_unit<>meter_unit and exists(select 1 from public.edp_billables where equipment_id=e.id) then raise exception 'Equipo con cantidades reconocidas: revisar unidad fuera de este flujo';end if;
 update public.edp_equipment set meter_unit=classify_report.meter_unit where id=e.id;
 if r.equipment_original<>e.code then insert into public.edp_aliases(tenant_id,original_code,equipment_id) values(r.tenant_id,r.equipment_original,e.id) on conflict(tenant_id,original_code) do nothing;
  if not exists(select 1 from public.edp_aliases where tenant_id=r.tenant_id and original_code=r.equipment_original and equipment_id=e.id) then raise exception 'Alias ya asociado a otro equipo';end if;
 end if;
 if meter_unit='unknown' then problems:=array_append(problems,'Unidad de medición pendiente');end if;
 if r.meter_end<r.meter_start then problems:=array_append(problems,'Medidor decreciente');end if;
 if meter_unit='hours' and r.meter_end-r.meter_start<>r.reported_hours then problems:=array_append(problems,'Diferencia entre horas informadas y medidor');end if;
 update public.edp_reports_data set equipment_id=e.id,cost_center_id=center,classification_override=true,issues=problems,notes=notes||E'\nClasificación autorizada: '||reason where id=r.id;
end;$$;
create function public.edp_classify_report(report uuid,equipment uuid,center uuid,meter_unit text,reason text) returns void language sql security invoker set search_path='' as $$select edp_private.classify_report(report,equipment,center,meter_unit,reason);$$;
revoke all on function public.edp_classify_report(uuid,uuid,uuid,text,text),edp_private.classify_report(uuid,uuid,uuid,text,text) from public;
grant execute on function public.edp_classify_report(uuid,uuid,uuid,text,text),edp_private.classify_report(uuid,uuid,uuid,text,text) to authenticated;

-- PostgreSQL numeric accepts NaN; financial inputs must explicitly reject it.
do $$declare entry text; tbl text; col text;begin
 foreach entry in array array['rates.normal','rates.extra','rates.od','rates.fs','rates.mobilization','rates.demobilization','reports_data.meter_start','reports_data.meter_end','reports_data.reported_hours','billables.quantity','billables.rate_snapshot','adjustments.amount'] loop
  tbl:=split_part(entry,'.',1);col:=split_part(entry,'.',2);
  execute format('alter table public.edp_%I add constraint %I check (%I is null or %I::text not in (''NaN'',''Infinity'',''-Infinity''))',tbl,tbl||'_'||col||'_finite',col,col);
 end loop;
end$$;
