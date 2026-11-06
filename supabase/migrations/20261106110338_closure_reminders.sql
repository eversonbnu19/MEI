-- App-owned recurring reminders; never closes hours or modifies existing closure rules.
create extension if not exists pg_cron;
create schema if not exists mei_reminder_private;
revoke all on schema mei_reminder_private from public,anon,authenticated;

create table public.mei_closure_reminder_settings(
 contract_id uuid primary key references public.mei_contracts(id),
 company_id uuid not null references public.mei_companies(id),
 enabled boolean not null default false,
 frequency text not null check(frequency in ('monthly','fortnightly')),
 end_day_one integer not null check(end_day_one between 1 and 31),
 notify_day_one integer not null check(notify_day_one between 1 and 31),
 end_day_two integer,notify_day_two integer,
 effective_from date not null,
 revision integer not null check(revision>0),
 updated_by uuid not null references public.mei_profiles(id),
 updated_at timestamptz not null default now(),
 check(frequency='monthly' or (end_day_two is not null and notify_day_two is not null and end_day_one<=27 and end_day_two between end_day_one+1 and 31 and notify_day_two between 1 and 31))
);
create index mei_reminder_settings_company on public.mei_closure_reminder_settings(company_id);
create table public.mei_closure_reminder_audit(
 id bigint generated always as identity primary key,
 company_id uuid not null,contract_id uuid not null,actor_id uuid not null,
 previous_content jsonb,new_content jsonb not null,created_at timestamptz not null default now()
);
create index mei_reminder_audit_company_time on public.mei_closure_reminder_audit(company_id,created_at desc);
create table public.mei_closure_reminder_periods(
 id uuid primary key default gen_random_uuid(),
 contract_id uuid not null references public.mei_contracts(id),
 company_id uuid not null references public.mei_companies(id),
 schedule_revision integer not null,period_start date not null,period_end date not null,due_date date not null,
 initial_sent_date date,followup_sent_date date,
 unique(contract_id,period_start,period_end),check(period_start<=period_end and due_date>period_end)
);
create index mei_reminder_periods_company_due on public.mei_closure_reminder_periods(company_id,due_date);
create table public.mei_closure_reminder_deliveries(
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.mei_companies(id),delivery_date date not null,
 status text not null default 'pending' check(status in ('pending','failed','sent','suppressed')),
 items jsonb not null,email text,content jsonb,attempts integer not null default 0,
 provider_message_id text,error text,created_at timestamptz not null default now(),sent_at timestamptz,
 unique(company_id,delivery_date)
);
create index mei_reminder_deliveries_company_time on public.mei_closure_reminder_deliveries(company_id,created_at desc);
create table mei_reminder_private.worker_state(
 singleton boolean primary key default true check(singleton),
 run_id uuid,lease_until timestamptz
);
insert into mei_reminder_private.worker_state(singleton) values(true);
alter table mei_reminder_private.worker_state enable row level security;

alter table public.mei_closure_reminder_settings enable row level security;
alter table public.mei_closure_reminder_audit enable row level security;
alter table public.mei_closure_reminder_periods enable row level security;
alter table public.mei_closure_reminder_deliveries enable row level security;
create policy reminder_settings_owner on public.mei_closure_reminder_settings for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_closure_reminder_settings.company_id and o.user_id=(select auth.uid())));
create policy reminder_audit_owner on public.mei_closure_reminder_audit for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_closure_reminder_audit.company_id and o.user_id=(select auth.uid())));
create policy reminder_periods_owner on public.mei_closure_reminder_periods for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_closure_reminder_periods.company_id and o.user_id=(select auth.uid())));
create policy reminder_deliveries_owner on public.mei_closure_reminder_deliveries for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_closure_reminder_deliveries.company_id and o.user_id=(select auth.uid())));
revoke all on public.mei_closure_reminder_settings,public.mei_closure_reminder_audit,public.mei_closure_reminder_periods,public.mei_closure_reminder_deliveries from public,anon,authenticated;
grant select on public.mei_closure_reminder_settings,public.mei_closure_reminder_audit,public.mei_closure_reminder_periods,public.mei_closure_reminder_deliveries to authenticated;
grant all on public.mei_closure_reminder_settings,public.mei_closure_reminder_audit,public.mei_closure_reminder_periods,public.mei_closure_reminder_deliveries to service_role;
revoke all on sequence public.mei_closure_reminder_audit_id_seq from public,anon,authenticated;
grant usage,select on sequence public.mei_closure_reminder_audit_id_seq to service_role;

create function public.mei_save_closure_reminder(p_contract uuid,p_settings jsonb,p_expected_revision integer)
returns public.mei_closure_reminder_settings language plpgsql security definer set search_path='' as $$
declare c public.mei_contracts;old_row public.mei_closure_reminder_settings;new_row public.mei_closure_reminder_settings;
begin
 select * into c from public.mei_contracts where id=p_contract;
 if auth.uid() is null or not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id where o.company_id=c.company_id and o.user_id=auth.uid() and p.role='company') then raise exception 'Somente a Empresa principal pode configurar lembretes' using errcode='42501';end if;
 if c.model<>'hour' then raise exception 'Lembretes disponíveis apenas para contratos por hora';end if;
 if c.status<>'active' and coalesce((p_settings->>'enabled')::boolean,false) then raise exception 'Ative o contrato antes de habilitar o lembrete';end if;
 perform pg_advisory_xact_lock(hashtextextended('reminder-settings:'||p_contract::text,0));
 select * into old_row from public.mei_closure_reminder_settings where contract_id=p_contract;
 if p_expected_revision is null or p_expected_revision<>coalesce(old_row.revision,0) then raise exception 'Configuração alterada em outra sessão. Recarregue antes de salvar.' using errcode='40001';end if;
 if (p_settings->>'effective_from')::date<c.start_date or (p_settings->>'effective_from')::date<'2000-01-01' then raise exception 'A vigência deve começar na data do contrato ou depois';end if;
 insert into public.mei_closure_reminder_settings(contract_id,company_id,enabled,frequency,end_day_one,notify_day_one,end_day_two,notify_day_two,effective_from,revision,updated_by)
 values(c.id,c.company_id,(p_settings->>'enabled')::boolean,p_settings->>'frequency',(p_settings->>'end_day_one')::integer,(p_settings->>'notify_day_one')::integer,
 case when p_settings->>'frequency'='fortnightly' then (p_settings->>'end_day_two')::integer end,case when p_settings->>'frequency'='fortnightly' then (p_settings->>'notify_day_two')::integer end,
 (p_settings->>'effective_from')::date,coalesce(old_row.revision,0)+1,auth.uid())
 on conflict(contract_id) do update set enabled=excluded.enabled,frequency=excluded.frequency,end_day_one=excluded.end_day_one,notify_day_one=excluded.notify_day_one,end_day_two=excluded.end_day_two,notify_day_two=excluded.notify_day_two,effective_from=excluded.effective_from,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
 returning * into new_row;
 insert into public.mei_closure_reminder_audit(company_id,contract_id,actor_id,previous_content,new_content) values(c.company_id,c.id,auth.uid(),to_jsonb(old_row),to_jsonb(new_row));
 return new_row;
end $$;
revoke all on function public.mei_save_closure_reminder(uuid,jsonb,integer) from public,anon;
grant execute on function public.mei_save_closure_reminder(uuid,jsonb,integer) to authenticated;

-- The end date matches mei_close_period: completed entries use ended_at in Brasília.
create function mei_reminder_private.pending_items(p_company uuid,p_today date)
returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(q) order by q.period_end,q.contract_code),'[]'::jsonb) from (
 select o.id as occurrence_id,c.id as contract_id,c.code as contract_code,c.service as contract_service,coalesce(p.name,'MEI') as mei_name,
 o.period_start,o.period_end,o.due_date,
 case when o.initial_sent_date is null then 'initial' else 'followup' end as stage,
 round(coalesce(sum(e.minutes_worked)/60.0,0),2) as total_hours,
 count(*) filter(where e.ended_at is null) as open_entries,
 jsonb_agg(e.id order by e.id) as entry_ids
 from public.mei_closure_reminder_periods o
 join public.mei_closure_reminder_settings s on s.contract_id=o.contract_id and s.revision=o.schedule_revision and s.enabled
 join public.mei_contracts c on c.id=o.contract_id and c.company_id=o.company_id and c.model='hour' and c.status='active'
 join public.mei_profiles p on p.id=c.mei_id
 join public.mei_hour_entries e on e.contract_id=c.id and e.closure_id is null and not e.is_voided
 and (coalesce(e.ended_at,e.started_at) at time zone 'America/Sao_Paulo')::date between o.period_start and o.period_end
 where o.company_id=p_company and o.due_date<=p_today
 and (o.initial_sent_date is null or (o.followup_sent_date is null and p_today>=o.initial_sent_date+3))
 group by o.id,c.id,c.code,c.service,p.name
 )q;
$$;
revoke all on function mei_reminder_private.pending_items(uuid,date) from public,anon,authenticated;

create function public.mei_pending_closure_reminders(p_company uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id where o.company_id=p_company and o.user_id=auth.uid() and p.role='company') then raise exception 'Avisos disponíveis somente para a Empresa principal' using errcode='42501';end if;
 -- Keep the panel visible for unclosed periods even between the initial and follow-up mail.
 return coalesce((select jsonb_agg(to_jsonb(q) order by q.period_end,q.contract_code) from (
 select o.id as occurrence_id,c.id as contract_id,c.code as contract_code,coalesce(p.name,'MEI') as mei_name,o.period_start,o.period_end,
 round(coalesce(sum(e.minutes_worked)/60.0,0),2) as total_hours,count(*) filter(where e.ended_at is null) as open_entries
 from public.mei_closure_reminder_periods o join public.mei_closure_reminder_settings s on s.contract_id=o.contract_id and s.enabled and s.revision=o.schedule_revision
 join public.mei_contracts c on c.id=o.contract_id and c.status='active' and c.model='hour'
 join public.mei_profiles p on p.id=c.mei_id
 join public.mei_hour_entries e on e.contract_id=c.id and e.closure_id is null and not e.is_voided
 and (coalesce(e.ended_at,e.started_at) at time zone 'America/Sao_Paulo')::date between o.period_start and o.period_end
 where o.company_id=p_company and o.due_date<=(now() at time zone 'America/Sao_Paulo')::date group by o.id,c.id,c.code,p.name
 )q),'[]'::jsonb);
end $$;
revoke all on function public.mei_pending_closure_reminders(uuid) from public,anon;
grant execute on function public.mei_pending_closure_reminders(uuid) to authenticated;

-- Token stays in Vault; neither migrations nor clients contain its value.
do $$begin
 if not exists(select 1 from vault.secrets where name='mei_closure_reminder_token') then
 perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'mei_closure_reminder_token','Internal app reminder scheduler');
 end if;
end $$;
create function public.mei_begin_reminder_run(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare run uuid:=gen_random_uuid();
begin
 if p_token is null or not exists(select 1 from vault.decrypted_secrets where name='mei_closure_reminder_token' and extensions.digest(decrypted_secret,'sha256')=extensions.digest(p_token,'sha256')) then raise exception 'Agendamento não autorizado' using errcode='42501';end if;
 if (now() at time zone 'America/Sao_Paulo')::time<time '09:00' or (now() at time zone 'America/Sao_Paulo')::time>=time '10:00' then return null;end if;
 update mei_reminder_private.worker_state set run_id=run,lease_until=now()+interval '8 minutes' where singleton and (lease_until is null or lease_until<now());
 if not found then return null;end if;
 return run;
end $$;
revoke all on function public.mei_begin_reminder_run(text) from public,anon,authenticated;
grant execute on function public.mei_begin_reminder_run(text) to service_role;

create function public.mei_reminder_worker(p_action text,p_run uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date;
 item jsonb; candidate jsonb;cfg public.mei_closure_reminder_settings;owner record;delivery public.mei_closure_reminder_deliveries;result jsonb:='[]'::jsonb;current_items jsonb;
begin
 if not exists(select 1 from mei_reminder_private.worker_state where singleton and run_id=p_run and lease_until>now()) then raise exception 'Execução expirada' using errcode='42501';end if;
 if p_action='sync' then
  for item in select value from jsonb_array_elements(p_payload->'periods') loop
   select s.* into cfg from public.mei_closure_reminder_settings s join public.mei_contracts c on c.id=s.contract_id where s.contract_id=(item->>'contract_id')::uuid and s.revision=(item->>'revision')::integer and s.enabled and c.model='hour' and c.status='active';
   if found and (item->>'due_date')::date between cfg.effective_from and today and (item->>'period_end')::date<(item->>'due_date')::date then
    insert into public.mei_closure_reminder_periods(contract_id,company_id,schedule_revision,period_start,period_end,due_date)
    values(cfg.contract_id,cfg.company_id,cfg.revision,(item->>'period_start')::date,(item->>'period_end')::date,(item->>'due_date')::date)
    on conflict(contract_id,period_start,period_end) do update set schedule_revision=excluded.schedule_revision,due_date=excluded.due_date;
   end if;
  end loop;
  return jsonb_build_object('ok',true);
 elsif p_action='claim' then
  for owner in select o.company_id,o.user_id,c.name as company_name from public.mei_email_owners o join public.mei_companies c on c.id=o.company_id join public.mei_profiles p on p.id=o.user_id and p.role='company' loop
   current_items:=mei_reminder_private.pending_items(owner.company_id,today);
   if jsonb_array_length(current_items)>0 then
    insert into public.mei_closure_reminder_deliveries(company_id,delivery_date,items) values(owner.company_id,today,current_items) on conflict(company_id,delivery_date) do nothing;
   end if;
   select * into delivery from public.mei_closure_reminder_deliveries where company_id=owner.company_id and delivery_date=today and status in ('pending','failed') and attempts<6;
   if found then result:=result||jsonb_build_array(to_jsonb(delivery)||jsonb_build_object('owner_id',owner.user_id,'company_name',owner.company_name));end if;
  end loop;
  return result;
 elsif p_action='content' then
  update public.mei_closure_reminder_deliveries set email=coalesce(email,p_payload->>'email'),content=coalesce(content,p_payload->'content')
  where id=(p_payload->>'id')::uuid and delivery_date=today and status in ('pending','failed') returning * into delivery;
  return to_jsonb(delivery);
 elsif p_action='validate' then
  select * into delivery from public.mei_closure_reminder_deliveries where id=(p_payload->>'id')::uuid and delivery_date=today and status in ('pending','failed');
  if not found then return jsonb_build_object('valid',false);end if;
  current_items:=mei_reminder_private.pending_items(delivery.company_id,today);
  for item in select value from jsonb_array_elements(delivery.items) loop
   select value into candidate from jsonb_array_elements(current_items) where value->>'occurrence_id'=item->>'occurrence_id' and value->>'stage'=item->>'stage';
   if candidate is null or not (candidate->'entry_ids' @> item->'entry_ids') then
    update public.mei_closure_reminder_deliveries set status='suppressed',error='Pendências alteradas ou fechadas antes do envio' where id=delivery.id;
    return jsonb_build_object('valid',false);
   end if;
  end loop;
  update public.mei_closure_reminder_deliveries set attempts=attempts+1 where id=delivery.id;
  return jsonb_build_object('valid',true);
 elsif p_action='finish' then
  select * into delivery from public.mei_closure_reminder_deliveries where id=(p_payload->>'id')::uuid and delivery_date=today for update;
  if not found or delivery.status in ('sent','suppressed') then return jsonb_build_object('ok',false);end if;
  if p_payload->>'status'='sent' then
   update public.mei_closure_reminder_deliveries set status='sent',sent_at=now(),provider_message_id=p_payload->>'provider_message_id',error=null where id=delivery.id;
   for item in select value from jsonb_array_elements(delivery.items) loop
    update public.mei_closure_reminder_periods set initial_sent_date=case when item->>'stage'='initial' then coalesce(initial_sent_date,today) else initial_sent_date end,
     followup_sent_date=case when item->>'stage'='followup' then today else followup_sent_date end where id=(item->>'occurrence_id')::uuid;
   end loop;
  else update public.mei_closure_reminder_deliveries set status='failed',error=left(p_payload->>'error',1000) where id=delivery.id;
  end if;
  return jsonb_build_object('ok',true);
 elsif p_action='release' then
  update mei_reminder_private.worker_state set lease_until=null where singleton and run_id=p_run;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Ação inválida';
end $$;
revoke all on function public.mei_reminder_worker(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mei_reminder_worker(text,uuid,jsonb) to service_role;

create function mei_reminder_private.invoke_worker()
returns bigint language plpgsql security definer set search_path='' as $$
begin
 if (now() at time zone 'America/Sao_Paulo')::time>=time '09:00' and (now() at time zone 'America/Sao_Paulo')::time<time '10:00' then
 return net.http_post(url:='https://xawgjtyijeuebdmqvssr.supabase.co/functions/v1/mei-closure-reminders',
 headers:=jsonb_build_object('Content-Type','application/json','X-Reminder-Token',(select decrypted_secret from vault.decrypted_secrets where name='mei_closure_reminder_token')),
 body:='{}'::jsonb,timeout_milliseconds:=10000);
 end if;
 return null;
end $$;
revoke all on function mei_reminder_private.invoke_worker() from public,anon,authenticated;
do $$declare job bigint;begin
 job:=cron.schedule('mei-closure-reminders','*/10 * * * *','select mei_reminder_private.invoke_worker();');
 perform cron.alter_job(job,active:=false);
end $$;

insert into public.mei_email_defaults(event,recipient_role,subject,body) values('closure_reminder','company','Fechamento de horas pendente — {{nome_empresa}}','Olá, {{nome_destino}}.

Há horas aguardando fechamento nos contratos abaixo:

{{lista_contratos_pendentes}}

{{link_fechamentos}}

Aviso de {{data_aviso}}. Confira e realize o fechamento no sistema.');
