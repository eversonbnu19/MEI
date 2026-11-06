create or replace function public.mei_reminder_worker(p_action text,p_run uuid,p_payload jsonb default '{}'::jsonb)
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
end $$;
revoke all on function public.mei_reminder_worker(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mei_reminder_worker(text,uuid,jsonb) to service_role;

