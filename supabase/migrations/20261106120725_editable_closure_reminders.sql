-- Editable reminder bindings with reversible deletion and immutable delivery history.
alter table public.mei_closure_reminder_settings add column deleted_at timestamptz, add column binding_from date;
alter table public.mei_closure_reminder_settings add constraint mei_reminder_deleted_disabled check(deleted_at is null or enabled=false);
alter table public.mei_closure_reminder_audit add column action text not null default 'update',add column related_contract_id uuid;

create function public.mei_manage_closure_reminder(p_action text,p_source_contract uuid,p_target_contract uuid,p_settings jsonb,p_expected_revision integer,p_expected_target_revision integer default 0)
returns public.mei_closure_reminder_settings language plpgsql security definer set search_path='' as $$
declare
 source_contract public.mei_contracts;target_contract public.mei_contracts;
 source_row public.mei_closure_reminder_settings;target_row public.mei_closure_reminder_settings;new_row public.mei_closure_reminder_settings;
 lock_id uuid;moving boolean:=p_source_contract is not null and p_target_contract is not null and p_source_contract<>p_target_contract;
 today date:=(now() at time zone 'America/Sao_Paulo')::date;event_name text;
begin
 if auth.uid() is null then raise exception 'Sessão obrigatória' using errcode='42501';end if;
 if p_action is null or p_action not in ('save','toggle','delete') then raise exception 'Ação inválida';end if;
 if p_action in ('toggle','delete') and p_source_contract is null then raise exception 'Lembrete não informado';end if;
 if p_action in ('toggle','delete') and p_target_contract is not null and p_target_contract<>p_source_contract then raise exception 'Contrato de destino inválido';end if;
 if p_source_contract is not null then
  select * into source_contract from public.mei_contracts where id=p_source_contract;
  if not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id and p.role='company' where o.company_id=source_contract.company_id and o.user_id=auth.uid()) then raise exception 'Somente a Empresa principal pode gerenciar este lembrete' using errcode='42501';end if;
 end if;
 if p_action='save' then
  select * into target_contract from public.mei_contracts where id=p_target_contract;
  if not found then raise exception 'Selecione um contrato ativo por hora';end if;
  if not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id and p.role='company' where o.company_id=target_contract.company_id and o.user_id=auth.uid()) then raise exception 'Contrato de destino não autorizado' using errcode='42501';end if;
  if target_contract.model<>'hour' or target_contract.status<>'active' then raise exception 'Selecione somente contratos ativos por hora';end if;
  if p_source_contract is not null and source_contract.company_id<>target_contract.company_id then raise exception 'O contrato deve pertencer à mesma empresa' using errcode='42501';end if;
 end if;
 -- Lock both bindings in a stable order; also compatible with the previous save RPC.
 for lock_id in select distinct v from unnest(array[p_source_contract,p_target_contract])v where v is not null order by v loop
  perform pg_advisory_xact_lock(hashtextextended('reminder-settings:'||lock_id::text,0));
 end loop;
 if p_source_contract is not null then
  select * into source_row from public.mei_closure_reminder_settings where contract_id=p_source_contract;
  if not found or source_row.deleted_at is not null then raise exception 'Lembrete não encontrado. Recarregue a lista.' using errcode='40001';end if;
  if p_expected_revision is null or source_row.revision<>p_expected_revision then raise exception 'Lembrete alterado em outra sessão. Recarregue antes de salvar.' using errcode='40001';end if;
 end if;
 if p_action in ('toggle','delete') then
  if p_action='toggle' and coalesce((p_settings->>'enabled')::boolean,false) and (source_contract.status<>'active' or source_contract.model<>'hour') then raise exception 'Somente contratos ativos por hora podem receber lembretes';end if;
  update public.mei_closure_reminder_settings set enabled=case when p_action='delete' then false else (p_settings->>'enabled')::boolean end,
   deleted_at=case when p_action='delete' then now() else null end,
   revision=revision+1,updated_by=auth.uid(),updated_at=now()
   where contract_id=p_source_contract returning * into new_row;
  event_name:=case when p_action='delete' then 'delete' when new_row.enabled then 'enable' else 'disable' end;
  insert into public.mei_closure_reminder_audit(company_id,contract_id,actor_id,previous_content,new_content,action)
   values(new_row.company_id,new_row.contract_id,auth.uid(),to_jsonb(source_row),to_jsonb(new_row),event_name);
  return new_row;
 end if;
 if p_target_contract=p_source_contract then target_row:=source_row;
 else
  select * into target_row from public.mei_closure_reminder_settings where contract_id=p_target_contract;
  if found and target_row.deleted_at is null then raise exception 'Este contrato já possui um lembrete. Edite o existente.' using errcode='23505';end if;
  if p_expected_target_revision is null or coalesce(target_row.revision,0)<>p_expected_target_revision then raise exception 'O contrato de destino foi alterado em outra sessão. Recarregue a lista.' using errcode='40001';end if;
 end if;
 if (p_settings->>'effective_from')::date<target_contract.start_date or (p_settings->>'effective_from')::date<'2000-01-01' then raise exception 'A vigência deve começar na data do contrato selecionado ou depois';end if;
 if moving then
  update public.mei_closure_reminder_settings set enabled=false,deleted_at=now(),revision=revision+1,updated_by=auth.uid(),updated_at=now()
   where contract_id=p_source_contract returning * into new_row;
  insert into public.mei_closure_reminder_audit(company_id,contract_id,actor_id,previous_content,new_content,action,related_contract_id)
   values(new_row.company_id,new_row.contract_id,auth.uid(),to_jsonb(source_row),to_jsonb(new_row),'move_from',p_target_contract);
 end if;
 insert into public.mei_closure_reminder_settings(contract_id,company_id,enabled,frequency,end_day_one,notify_day_one,end_day_two,notify_day_two,effective_from,revision,updated_by,deleted_at,binding_from)
 values(target_contract.id,target_contract.company_id,(p_settings->>'enabled')::boolean,p_settings->>'frequency',(p_settings->>'end_day_one')::integer,(p_settings->>'notify_day_one')::integer,
 case when p_settings->>'frequency'='fortnightly' then (p_settings->>'end_day_two')::integer end,case when p_settings->>'frequency'='fortnightly' then (p_settings->>'notify_day_two')::integer end,
 (p_settings->>'effective_from')::date,coalesce(target_row.revision,0)+1,auth.uid(),null,
 case when moving then today when p_source_contract is not null then source_row.binding_from when target_row.deleted_at is not null then today end)
 on conflict(contract_id) do update set enabled=excluded.enabled,frequency=excluded.frequency,end_day_one=excluded.end_day_one,notify_day_one=excluded.notify_day_one,end_day_two=excluded.end_day_two,notify_day_two=excluded.notify_day_two,effective_from=excluded.effective_from,
 revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now(),deleted_at=null,binding_from=excluded.binding_from returning * into new_row;
 insert into public.mei_closure_reminder_audit(company_id,contract_id,actor_id,previous_content,new_content,action,related_contract_id)
 values(new_row.company_id,new_row.contract_id,auth.uid(),to_jsonb(target_row),to_jsonb(new_row),
 case when moving then 'move_to' when p_source_contract is null then 'create' else 'update' end,
 case when moving then p_source_contract end);
 return new_row;
end $$;
revoke all on function public.mei_manage_closure_reminder(text,uuid,uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.mei_manage_closure_reminder(text,uuid,uuid,jsonb,integer,integer) to authenticated;

-- Compatibility for older open tabs. All writes now share the same checks and locks.
create or replace function public.mei_save_closure_reminder(p_contract uuid,p_settings jsonb,p_expected_revision integer)
returns public.mei_closure_reminder_settings language plpgsql security definer set search_path='' as $$
declare current_row public.mei_closure_reminder_settings;
begin
 select * into current_row from public.mei_closure_reminder_settings where contract_id=p_contract;
 if current_row.contract_id is null or current_row.deleted_at is not null then
  return public.mei_manage_closure_reminder('save',null,p_contract,p_settings,0,p_expected_revision);
 end if;
 return public.mei_manage_closure_reminder('save',p_contract,p_contract,p_settings,p_expected_revision,p_expected_revision);
end $$;
revoke all on function public.mei_save_closure_reminder(uuid,jsonb,integer) from public,anon;
grant execute on function public.mei_save_closure_reminder(uuid,jsonb,integer) to authenticated;

CREATE OR REPLACE FUNCTION mei_reminder_private.pending_items(p_company uuid, p_today date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
 where s.deleted_at is null and o.due_date>=coalesce(s.binding_from,s.effective_from) and o.company_id=p_company and o.due_date<=p_today
 and (o.initial_sent_date is null or (o.followup_sent_date is null and p_today>=o.initial_sent_date+3))
 group by o.id,c.id,c.code,c.service,p.name
 )q;
$function$;

CREATE OR REPLACE FUNCTION public.mei_pending_closure_reminders(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 where s.deleted_at is null and o.due_date>=coalesce(s.binding_from,s.effective_from) and o.company_id=p_company and o.due_date<=(now() at time zone 'America/Sao_Paulo')::date group by o.id,c.id,c.code,p.name
 )q),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.mei_reminder_worker(p_action text, p_run uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date;
 item jsonb; candidate jsonb;cfg public.mei_closure_reminder_settings;owner record;delivery public.mei_closure_reminder_deliveries;result jsonb:='[]'::jsonb;current_items jsonb;
begin
 if not exists(select 1 from mei_reminder_private.worker_state where singleton and run_id=p_run and lease_until>now()) then raise exception 'Execução expirada' using errcode='42501';end if;
 if p_action='sync' then
  for item in select value from jsonb_array_elements(p_payload->'periods') loop
   select s.* into cfg from public.mei_closure_reminder_settings s join public.mei_contracts c on c.id=s.contract_id where s.contract_id=(item->>'contract_id')::uuid and s.revision=(item->>'revision')::integer and s.enabled and c.model='hour' and c.status='active';
   if found and (item->>'due_date')::date between greatest(cfg.effective_from,coalesce(cfg.binding_from,cfg.effective_from)) and today and (item->>'period_end')::date<(item->>'due_date')::date then
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
   if candidate is null or not ((candidate->'entry_ids') @> (item->'entry_ids')) then
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
end $function$;

notify pgrst, 'reload schema';
