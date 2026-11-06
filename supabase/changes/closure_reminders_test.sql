-- Integration tests run with disposable rows and rollback.
begin;
do $test$
declare
 own record;c uuid:=gen_random_uuid();mei uuid;run uuid:=gen_random_uuid();revision integer;cfg public.mei_closure_reminder_settings;
 today date:=(now() at time zone 'America/Sao_Paulo')::date;start_day date;end_day date;due date;entry uuid;voided uuid;delivery jsonb;pending jsonb;period_id uuid;
begin
 select * into own from public.mei_email_owners limit 1;
 select id into mei from public.mei_profiles where role='mei' limit 1;
 if own.user_id is null or mei is null then raise exception 'Fixture existente indisponível';end if;
 perform set_config('request.jwt.claim.sub',own.user_id::text,true);
 end_day:=today-2;start_day:=end_day-14;due:=today-1;
 insert into public.mei_contracts(id,company_id,mei_id,code,model,service,start_date,status,created_by)
 values(c,own.company_id,mei,'__REMINDER_TEST__','hour','Teste descartável',start_day-30,'active',own.user_id);
 select * into cfg from public.mei_save_closure_reminder(c,jsonb_build_object('enabled',true,'frequency','monthly','end_day_one',31,'notify_day_one',1,'effective_from',start_day),0);
 if cfg.revision<>1 then raise exception 'Configuração não salva';end if;
 begin perform public.mei_save_closure_reminder(c,to_jsonb(cfg),0);raise exception 'Conflito não bloqueado';exception when serialization_failure then null;end;
 begin perform public.mei_save_closure_reminder(c,jsonb_build_object('enabled',true,'frequency','fortnightly','end_day_one',28,'notify_day_one',29,'end_day_two',31,'notify_day_two',1,'effective_from',start_day),1);raise exception 'Quinzena inválida aceita';exception when check_violation then null;end;
 begin perform public.mei_save_closure_reminder(c,jsonb_build_object('enabled',true,'frequency','fortnightly','end_day_one',15,'notify_day_one',16,'effective_from',start_day),1);raise exception 'Quinzena sem segundo dia aceita';exception when check_violation then null;end;
 if not exists(select 1 from public.mei_closure_reminder_audit where contract_id=c and actor_id=own.user_id and new_content->>'revision'='1') then raise exception 'Auditoria ausente';end if;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.mei_save_closure_reminder(c,to_jsonb(cfg),1);raise exception 'Outro usuário salvou';exception when insufficient_privilege then null;end;
 begin perform public.mei_pending_closure_reminders(own.company_id);raise exception 'Outro usuário leu avisos';exception when insufficient_privilege then null;end;
 execute 'set local role authenticated';
 if exists(select 1 from public.mei_closure_reminder_settings where contract_id=c) then raise exception 'RLS expôs configuração de outro usuário';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',own.user_id::text,true);
 update mei_reminder_private.worker_state set run_id=run,lease_until=now()+interval '5 minutes' where singleton;
 perform public.mei_reminder_worker('sync',run,jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('contract_id',c,'revision',1,'period_start',start_day,'period_end',end_day,'due_date',due))));
 select id into period_id from public.mei_closure_reminder_periods where contract_id=c;
 if period_id is null then raise exception 'Período não gerado';end if;
 -- Match the actual close-period selection: ended_at date, not started_at.
 insert into public.mei_hour_entries(contract_id,mei_id,started_at,ended_at,start_hour_rate)
 values(c,mei,(end_day-1+time '23:00') at time zone 'America/Sao_Paulo',(end_day+time '01:00') at time zone 'America/Sao_Paulo',10) returning id into entry;
 insert into public.mei_hour_entries(contract_id,mei_id,started_at,ended_at,start_hour_rate,is_voided)
 values(c,mei,(end_day+time '01:00') at time zone 'America/Sao_Paulo',(end_day+time '02:00') at time zone 'America/Sao_Paulo',10,true) returning id into voided;
 pending:=mei_reminder_private.pending_items(own.company_id,today);
 if not exists(select 1 from jsonb_array_elements(pending)x where (x->>'contract_id')::uuid=c and (x->>'total_hours')::numeric=2 and jsonb_array_length(x->'entry_ids')=1) then raise exception 'Horas canceladas ou datas incorretas';end if;
 delivery:=public.mei_reminder_worker('claim',run);
 select value into delivery from jsonb_array_elements(delivery) where (value->>'company_id')::uuid=own.company_id;
 if delivery is null then raise exception 'Entrega consolidada ausente';end if;
 perform public.mei_reminder_worker('content',run,jsonb_build_object('id',delivery->>'id','email','fixture@example.com','content',jsonb_build_object('subject','Fixture','html','Fixture')));
 if not (public.mei_reminder_worker('validate',run,jsonb_build_object('id',delivery->>'id'))->>'valid')::boolean then raise exception 'Entrega válida cancelada';end if;
 perform public.mei_reminder_worker('finish',run,jsonb_build_object('id',delivery->>'id','status','sent','provider_message_id','fixture-only'));
 if exists(select 1 from jsonb_array_elements(mei_reminder_private.pending_items(own.company_id,today))x where (x->>'contract_id')::uuid=c) then raise exception 'Reforço enviado antes de 3 dias';end if;
 update public.mei_closure_reminder_periods set initial_sent_date=today-3 where id=period_id;
 if not exists(select 1 from jsonb_array_elements(mei_reminder_private.pending_items(own.company_id,today))x where (x->>'contract_id')::uuid=c and x->>'stage'='followup') then raise exception 'Reforço após 3 dias ausente';end if;
 -- One company/day even when a follow-up becomes eligible later.
 if jsonb_array_length(public.mei_reminder_worker('claim',run))<>0 then raise exception 'Entrega duplicada no mesmo dia';end if;
 update public.mei_closure_reminder_periods set followup_sent_date=today where id=period_id;
 if exists(select 1 from jsonb_array_elements(mei_reminder_private.pending_items(own.company_id,today))x where (x->>'contract_id')::uuid=c) then raise exception 'Mais de um reforço';end if;
 -- The panel remains until all hours are resolved; a partial resolution updates totals.
 if not exists(select 1 from jsonb_array_elements(public.mei_pending_closure_reminders(own.company_id))x where (x->>'contract_id')::uuid=c) then raise exception 'Painel desapareceu antes da correção';end if;
 update public.mei_hour_entries set is_voided=true where id=entry;
 if exists(select 1 from jsonb_array_elements(public.mei_pending_closure_reminders(own.company_id))x where (x->>'contract_id')::uuid=c) then raise exception 'Painel não removeu pendência resolvida';end if;
 update public.mei_hour_entries set is_voided=false where id=entry;
 update public.mei_closure_reminder_periods set followup_sent_date=null where id=period_id;
 update public.mei_closure_reminder_deliveries set status='failed' where id=(delivery->>'id')::uuid;
 update public.mei_hour_entries set is_voided=true where id=entry;
 if (public.mei_reminder_worker('validate',run,jsonb_build_object('id',delivery->>'id'))->>'valid')::boolean then raise exception 'Envio com pendência resolvida não cancelado';end if;
 if not exists(select 1 from public.mei_closure_reminder_deliveries where id=(delivery->>'id')::uuid and status='suppressed') then raise exception 'Cancelamento não registrado';end if;
 update public.mei_hour_entries set is_voided=false where id=entry;
 perform public.mei_close_period(c,start_day,end_day);
 if exists(select 1 from jsonb_array_elements(public.mei_pending_closure_reminders(own.company_id))x where (x->>'contract_id')::uuid=c) or not exists(select 1 from public.mei_hour_entries where id=entry and closure_id is not null) then raise exception 'Fechamento real não removeu aviso';end if;
 if has_function_privilege('authenticated','public.mei_reminder_worker(text,uuid,jsonb)','EXECUTE') or has_function_privilege('anon','public.mei_begin_reminder_run(text)','EXECUTE') or has_table_privilege('authenticated','public.mei_closure_reminder_audit','TRUNCATE') then raise exception 'Privilégios excessivos';end if;
 begin perform public.mei_begin_reminder_run('invalid-test-token');raise exception 'Token inválido aceito';exception when insufficient_privilege then null;end;
 perform public.mei_reminder_worker('release',run);
end $test$;
rollback;
