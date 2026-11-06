-- Editable reminder integration. All fixtures and writes are rolled back.
begin;
do $test$
declare
 own record;mei uuid;a uuid:=gen_random_uuid();b uuid:=gen_random_uuid();inactive uuid:=gen_random_uuid();piece uuid:=gen_random_uuid();foreign_company uuid:=gen_random_uuid();foreign_contract uuid:=gen_random_uuid();
 cfg jsonb;ra public.mei_closure_reminder_settings;rb public.mei_closure_reminder_settings;old_a_revision integer;
 occurrence uuid:=gen_random_uuid();delivery uuid:=gen_random_uuid();today date:=(now() at time zone 'America/Sao_Paulo')::date;run uuid:=gen_random_uuid();saved_items jsonb;
begin
 select * into own from public.mei_email_owners limit 1;
 select id into mei from public.mei_profiles where role='mei' limit 1;
 if own.user_id is null or mei is null then raise exception 'Fixture existente indisponível';end if;
 perform set_config('request.jwt.claim.sub',own.user_id::text,true);
 insert into public.mei_contracts(id,company_id,mei_id,code,model,service,start_date,status,created_by) values
 (a,own.company_id,mei,'__EDIT_REMINDER_A__','hour','Serviço A',today-100,'active',own.user_id),
 (b,own.company_id,mei,'__EDIT_REMINDER_B__','hour','Serviço B',today-100,'active',own.user_id),
 (inactive,own.company_id,mei,'__EDIT_REMINDER_INACTIVE__','hour','Inativo',today-100,'inactive',own.user_id),
 (piece,own.company_id,mei,'__EDIT_REMINDER_PIECE__','piece','Peças',today-100,'active',own.user_id);
 cfg:=jsonb_build_object('enabled',true,'frequency','fortnightly','end_day_one',10,'notify_day_one',12,'end_day_two',25,'notify_day_two',28,'effective_from',today-60);
 select * into ra from public.mei_manage_closure_reminder('save',null,a,cfg,0,0);
 if ra.revision<>1 or ra.deleted_at is not null then raise exception 'Inclusão incorreta';end if;
 begin perform public.mei_manage_closure_reminder('save',null,a,cfg,0,1);raise exception 'Duplicidade permitida';exception when unique_violation then null;end;
 select * into ra from public.mei_manage_closure_reminder('save',a,a,cfg||'{"notify_day_one":13}'::jsonb,1,1);
 if ra.notify_day_one<>13 or ra.revision<>2 then raise exception 'Edição incorreta';end if;
 cfg:=to_jsonb(ra);old_a_revision:=ra.revision;
 begin perform public.mei_manage_closure_reminder('save',a,a,cfg,1,1);raise exception 'Revisão antiga sobrescreveu';exception when serialization_failure then null;end;
 select * into rb from public.mei_manage_closure_reminder('save',null,b,cfg,0,0);
 begin perform public.mei_manage_closure_reminder('save',a,b,cfg,ra.revision,rb.revision);raise exception 'Destino ocupado foi sobrescrito';exception when unique_violation then null;end;
 if (select revision from public.mei_closure_reminder_settings where contract_id=a)<>ra.revision then raise exception 'Falha de atomicidade';end if;
 select * into rb from public.mei_manage_closure_reminder('delete',b,null,'{}',rb.revision,0);
 if rb.deleted_at is null or rb.enabled then raise exception 'Exclusão não interrompeu aviso';end if;
 saved_items:=jsonb_build_array(jsonb_build_object('contract_id',a,'contract_code','__EDIT_REMINDER_A__','mei_name','MEI de teste','period_start',today-30,'period_end',today-2));
 insert into public.mei_closure_reminder_deliveries(id,company_id,delivery_date,status,items,content,email,sent_at) values(delivery,own.company_id,'2999-12-31','sent',saved_items,'{"subject":"Histórico original","html":"Histórico original"}','fixture@example.com',now());
 insert into public.mei_closure_reminder_periods(id,contract_id,company_id,schedule_revision,period_start,period_end,due_date,initial_sent_date)
 values(occurrence,a,own.company_id,ra.revision,today-30,today-2,today-1,today-1);
 insert into public.mei_hour_entries(contract_id,mei_id,started_at,ended_at,start_hour_rate)
 values(a,mei,(today-2+time '08:00') at time zone 'America/Sao_Paulo',(today-2+time '10:00') at time zone 'America/Sao_Paulo',10);
 if not exists(select 1 from jsonb_array_elements(public.mei_pending_closure_reminders(own.company_id))x where (x->>'contract_id')::uuid=a) then raise exception 'Pendência inicial ausente';end if;
 select * into rb from public.mei_manage_closure_reminder('save',a,b,cfg,ra.revision,rb.revision);
 select * into ra from public.mei_closure_reminder_settings where contract_id=a;
 if ra.deleted_at is null or ra.enabled or ra.revision<>old_a_revision+1 then raise exception 'Origem não arquivada';end if;
 if rb.deleted_at is not null or rb.frequency<>'fortnightly' or rb.end_day_one<>10 or rb.notify_day_one<>13 or rb.end_day_two<>25 or rb.notify_day_two<>28 or rb.effective_from<>today-60 or rb.binding_from<>today then raise exception 'Troca não preservou datas e frequência';end if;
 if exists(select 1 from jsonb_array_elements(public.mei_pending_closure_reminders(own.company_id))x where (x->>'contract_id')::uuid=a) then raise exception 'Origem ainda gera aviso';end if;
 if (select items from public.mei_closure_reminder_deliveries where id=delivery)<>saved_items or not exists(select 1 from public.mei_closure_reminder_periods where id=occurrence and contract_id=a and initial_sent_date=today-1) then raise exception 'Histórico foi transferido ou alterado';end if;
 if not exists(select 1 from public.mei_closure_reminder_audit where contract_id=a and action='move_from' and related_contract_id=b) or not exists(select 1 from public.mei_closure_reminder_audit where contract_id=b and action='move_to' and related_contract_id=a) then raise exception 'Auditoria da troca incompleta';end if;
 -- No backfilling of overdue notices when a binding changes.
 update mei_reminder_private.worker_state set run_id=run,lease_until=now()+interval '5 minutes' where singleton;
 perform public.mei_reminder_worker('sync',run,jsonb_build_object('periods',jsonb_build_array(jsonb_build_object('contract_id',b,'revision',rb.revision,'period_start',today-30,'period_end',today-2,'due_date',today-1))));
 if exists(select 1 from public.mei_closure_reminder_periods where contract_id=b) then raise exception 'Troca gerou aviso retroativo';end if;
 begin perform public.mei_manage_closure_reminder('save',b,a,cfg,rb.revision,0);raise exception 'Destino com revisão antiga aceito';exception when serialization_failure then null;end;
 select * into rb from public.mei_manage_closure_reminder('toggle',b,null,'{"enabled":false}',rb.revision,0);
 if rb.enabled or rb.deleted_at is not null then raise exception 'Desativação excluiu a configuração';end if;
 select * into rb from public.mei_manage_closure_reminder('toggle',b,null,'{"enabled":true}',rb.revision,0);
 if not rb.enabled then raise exception 'Ativação falhou';end if;
 select * into rb from public.mei_manage_closure_reminder('delete',b,null,'{}',rb.revision,0);
 select * into rb from public.mei_manage_closure_reminder('save',null,b,cfg,0,rb.revision);
 if rb.deleted_at is not null or rb.binding_from<>today then raise exception 'Reinclusão incorreta';end if;
 begin perform public.mei_manage_closure_reminder('save',null,inactive,cfg,0,0);raise exception 'Contrato inativo aceito';exception when raise_exception then if sqlerrm not like 'Selecione somente contratos ativos%' then raise;end if;end;
 begin perform public.mei_manage_closure_reminder('save',null,piece,cfg,0,0);raise exception 'Contrato por peça aceito';exception when raise_exception then if sqlerrm not like 'Selecione somente contratos ativos%' then raise;end if;end;
 -- Even when the same person owns another company, a move cannot cross companies.
 insert into public.mei_companies(id,name,cnpj) values(foreign_company,'Empresa de teste','TEST-'||foreign_company::text);
 insert into public.mei_email_owners(company_id,user_id) values(foreign_company,own.user_id);
 insert into public.mei_contracts(id,company_id,mei_id,code,model,service,start_date,status,created_by) values(foreign_contract,foreign_company,mei,'__FOREIGN_REMINDER__','hour','Teste',today-100,'active',own.user_id);
 begin perform public.mei_manage_closure_reminder('save',b,foreign_contract,cfg,rb.revision,0);raise exception 'Troca entre empresas permitida';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 begin perform public.mei_manage_closure_reminder('delete',b,null,'{}',rb.revision,0);raise exception 'Outro usuário excluiu';exception when insufficient_privilege then null;end;
 begin perform public.mei_manage_closure_reminder('save',null,inactive,cfg,0,0);raise exception 'Outro usuário incluiu';exception when insufficient_privilege then null;end;
 if has_function_privilege('anon','public.mei_manage_closure_reminder(text,uuid,uuid,jsonb,integer,integer)','EXECUTE') or has_table_privilege('authenticated','public.mei_closure_reminder_settings','DELETE') then raise exception 'Privilégios excessivos';end if;
 perform set_config('request.jwt.claim.sub',own.user_id::text,true);
 perform public.mei_reminder_worker('release',run);
end $test$;
rollback;
