-- Integration checks: all test writes are rolled back.
begin;
select set_config('email_test.company',company_id::text,true),
       set_config('request.jwt.claim.sub',user_id::text,true)
from public.mei_email_owners limit 1;
set local role authenticated;
do $test$
declare
 c uuid:=current_setting('email_test.company')::uuid;
 owner_id text:=current_setting('request.jwt.claim.sub');
 first_revision integer; previous_audits integer; saved public.mei_email_templates;
begin
 if c is null then raise exception 'Titular não configurado'; end if;
 if has_table_privilege(current_user,'public.mei_email_template_audit','TRUNCATE') or
 has_table_privilege(current_user,'public.mei_email_template_audit','INSERT') or
 has_table_privilege(current_user,'public.mei_email_owners','UPDATE') then raise exception 'Privilégios excessivos'; end if;
 select count(*) into previous_audits from public.mei_email_template_audit where company_id=c;
 select coalesce(max(revision),0) into first_revision from public.mei_email_templates where company_id=c and event='closure_created' and recipient_role='mei';
 select * into saved from public.mei_save_email_template(c,'closure_created','mei','Teste sem variáveis','Texto livre sem variáveis',first_revision,false);
 if saved.revision<>first_revision+1 then raise exception 'Revisão incorreta'; end if;
 if not exists(select 1 from public.mei_email_template_audit where company_id=c and actor_id=auth.uid() and new_content->>'subject'='Teste sem variáveis' and previous_content ? 'body' and actor_email is not null) then raise exception 'Auditoria incompleta'; end if;
 begin
  perform public.mei_save_email_template(c,'closure_created','mei','Conflito','Não deve sobrescrever',first_revision,false);
  raise exception 'Conflito de revisão não bloqueado';
 exception when serialization_failure then null; end;
 select * into saved from public.mei_save_email_template(c,'closure_created','mei','','',saved.revision,true);
 if not exists(select 1 from public.mei_email_defaults d where d.event='closure_created' and d.recipient_role='mei' and d.subject=saved.subject and d.body=saved.body) then raise exception 'Restauração incorreta'; end if;
 if (select count(*) from public.mei_email_template_audit where company_id=c)<>previous_audits+2 then raise exception 'Auditoria não atômica'; end if;
 perform public.mei_reserve_email_test(c,'closure_created','mei');
 begin
  perform public.mei_reserve_email_test(c,'closure_created','mei');
  raise exception 'Limite de teste não aplicado';
 exception when raise_exception then
  if sqlerrm not like 'Aguarde 30 segundos%' then raise; end if;
 end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
 if exists(select 1 from public.mei_email_owners) or exists(select 1 from public.mei_email_templates) or exists(select 1 from public.mei_email_template_audit) then raise exception 'RLS expôs conteúdo a outro usuário'; end if;
 begin
  perform public.mei_save_email_template(c,'closure_created','mei','Negado','Negado',saved.revision,false);
  raise exception 'Usuário secundário conseguiu salvar';
 exception when insufficient_privilege then null; end;
 begin
  perform public.mei_reserve_email_test(c,'closure_created','mei');
  raise exception 'Usuário secundário conseguiu enviar teste';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.mei_email_owners(company_id,user_id) values(c,auth.uid());
  raise exception 'Cliente conseguiu alterar titular';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.mei_save_email_template(c,'closure_created','mei','Negado','Negado',saved.revision,false);
  raise exception 'Sessão ausente conseguiu salvar';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
do $test$
begin
 if has_function_privilege('anon','public.mei_save_email_template(uuid,text,text,text,text,integer,boolean)','EXECUTE') or
 has_function_privilege('anon','public.mei_reserve_email_test(uuid,text,text)','EXECUTE') or
 has_table_privilege('anon','public.mei_email_template_audit','SELECT') then raise exception 'Acesso anônimo excessivo'; end if;
end $test$;
rollback;
