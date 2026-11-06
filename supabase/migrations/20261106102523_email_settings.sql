-- Configurable automatic emails. No existing sending rule is changed.
create table public.mei_email_owners (
 company_id uuid primary key references public.mei_companies(id),
 user_id uuid not null references public.mei_profiles(id)
);
-- Only unambiguous existing company registrations are eligible.
insert into public.mei_email_owners(company_id,user_id)
 select company_id,(array_agg(user_id))[1] from public.mei_company_users
 group by company_id having count(*)=1;
alter table public.mei_email_owners enable row level security;
create policy email_owner_read on public.mei_email_owners for select to authenticated using(user_id=(select auth.uid()));
grant select on public.mei_email_owners to authenticated;
revoke all on public.mei_email_owners from anon;
revoke insert,update,delete on public.mei_email_owners from authenticated;

create table public.mei_email_defaults (
 event text not null, recipient_role text not null, subject text not null, body text not null,
 primary key(event,recipient_role)
);
insert into public.mei_email_defaults values
('closure_created','mei','{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // Fechamento realizado - emitir NFSe','Olá, {{nome_destino}}.

Fechamento realizado - emitir NFSe.

**Contrato:** {{contrato_codigo}} — {{contrato_servico}}
**Período:** {{periodo_inicio}} a {{periodo_fim}}
**Valor do fechamento:** {{valor_total}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('invoice_sent','company','{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // NFSe enviada - aguardando autorização','Olá, {{nome_destino}}.

NFSe enviada - aguardando autorização.

**Contrato:** {{contrato_codigo}} — {{contrato_servico}}
**Período:** {{periodo_inicio}} a {{periodo_fim}}
**Valor do fechamento:** {{valor_total}}
**NFSe:** {{numero_nfse}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('sent_to_payment','auditor','{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // NFSe liberada para conferência final e lançamento no ERP','Olá, {{nome_destino}}.

NFSe liberada para conferência final e lançamento no ERP.

**Contrato:** {{contrato_codigo}} — {{contrato_servico}}
**Período:** {{periodo_inicio}} a {{periodo_fim}}
**Valor do fechamento:** {{valor_total}}
**NFSe:** {{numero_nfse}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('erp_posted','company','{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // NFSe lançada no ERP','Olá, {{nome_destino}}.

NFSe lançada no ERP.

**Contrato:** {{contrato_codigo}} — {{contrato_servico}}
**Período:** {{periodo_inicio}} a {{periodo_fim}}
**Valor do fechamento:** {{valor_total}}
**NFSe:** {{numero_nfse}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('invoice_received','auditor','{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // NFSe disponível para conferência','Olá, {{nome_destino}}.

NFSe disponível para conferência.

**Contrato:** {{contrato_codigo}} — {{contrato_servico}}
**Período:** {{periodo_inicio}} a {{periodo_fim}}
**Valor do fechamento:** {{valor_total}}
**NFSe:** {{numero_nfse}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('user_invited','mei','Convite para Gestão de Contratos — {{nome_empresa}}','Olá, {{nome_destino}}.

{{nome_origem}} convidou você para acessar a empresa {{nome_empresa}} no Gestão de Contratos.

Acesse o link seguro para ativar seu acesso:
{{link_acesso}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'),
('user_invited','auditor','Convite para Gestão de Contratos — {{nome_empresa}}','Olá, {{nome_destino}}.

{{nome_origem}} convidou você para acessar a empresa {{nome_empresa}} no Gestão de Contratos.

Acesse o link seguro para ativar seu acesso:
{{link_acesso}}

Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.');
alter table public.mei_email_defaults enable row level security;
create policy email_defaults_read on public.mei_email_defaults for select to authenticated using(exists(select 1 from public.mei_email_owners where user_id=(select auth.uid())));
grant select on public.mei_email_defaults to authenticated;
revoke all on public.mei_email_defaults from anon;
revoke insert,update,delete on public.mei_email_defaults from authenticated;

create table public.mei_email_templates (
 company_id uuid not null references public.mei_companies(id),
 event text not null, recipient_role text not null,
 subject text not null check(length(btrim(subject))>0 and length(subject)<=500 and subject !~ E'[\\r\\n]'),
 body text not null check(length(btrim(body))>0 and length(body)<=30000),
 revision integer not null check(revision>0),
 updated_at timestamptz not null default now(),
 updated_by uuid not null references public.mei_profiles(id),
 primary key(company_id,event,recipient_role),
 foreign key(event,recipient_role) references public.mei_email_defaults(event,recipient_role)
);
create table public.mei_email_template_audit (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.mei_companies(id),
 event text not null, recipient_role text not null,
 actor_id uuid not null, actor_name text, actor_email text,
 action text not null check(action in ('save','restore')),
 previous_content jsonb not null, new_content jsonb not null,
 created_at timestamptz not null default now()
);
create index mei_email_audit_company_time on public.mei_email_template_audit(company_id,created_at desc,id desc);
alter table public.mei_email_templates enable row level security;
alter table public.mei_email_template_audit enable row level security;
create policy email_templates_read on public.mei_email_templates for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_email_templates.company_id and o.user_id=(select auth.uid())));
create policy email_audit_read on public.mei_email_template_audit for select to authenticated using(exists(select 1 from public.mei_email_owners o where o.company_id=mei_email_template_audit.company_id and o.user_id=(select auth.uid())));
grant select on public.mei_email_templates,public.mei_email_template_audit to authenticated;
revoke all on public.mei_email_templates,public.mei_email_template_audit from anon;
revoke insert,update,delete on public.mei_email_templates,public.mei_email_template_audit from authenticated;
grant all on public.mei_email_owners,public.mei_email_defaults,public.mei_email_templates,public.mei_email_template_audit to service_role;
grant usage,select on sequence public.mei_email_template_audit_id_seq to service_role;

create or replace function public.mei_save_email_template(p_company uuid,p_event text,p_role text,p_subject text,p_body text,p_expected_revision integer,p_restore boolean default false)
returns public.mei_email_templates
language plpgsql security definer set search_path='' as $$
declare
 v_default public.mei_email_defaults; v_old public.mei_email_templates; v_new public.mei_email_templates;
 v_name text; v_email text;
begin
 if auth.uid() is null or not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id where o.company_id=p_company and o.user_id=auth.uid() and p.role='company') then
  raise exception 'Somente a Empresa principal pode alterar os modelos' using errcode='42501';
 end if;
 select * into v_default from public.mei_email_defaults where event=p_event and recipient_role=p_role;
 if not found then raise exception 'Modelo inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company::text||':'||p_event||':'||p_role,0));
 select * into v_old from public.mei_email_templates where company_id=p_company and event=p_event and recipient_role=p_role;
 if p_expected_revision is null or coalesce(v_old.revision,0)<>p_expected_revision then
  raise exception 'Este modelo foi alterado em outra sessão. Recarregue antes de salvar.' using errcode='40001';
 end if;
 if p_restore then p_subject:=v_default.subject; p_body:=v_default.body; end if;
 if p_subject is null or p_body is null or length(btrim(p_subject))=0 or length(p_subject)>500 or p_subject ~ E'[\\r\\n]' or length(btrim(p_body))=0 or length(p_body)>30000 then
  raise exception 'Informe assunto (até 500 caracteres e uma linha) e mensagem (até 30.000 caracteres)';
 end if;
 insert into public.mei_email_templates(company_id,event,recipient_role,subject,body,revision,updated_by)
 values(p_company,p_event,p_role,p_subject,p_body,coalesce(v_old.revision,0)+1,auth.uid())
 on conflict(company_id,event,recipient_role) do update set subject=excluded.subject,body=excluded.body,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=now()
 returning * into v_new;
 select name,email into v_name,v_email from public.mei_profiles where id=auth.uid();
 insert into public.mei_email_template_audit(company_id,event,recipient_role,actor_id,actor_name,actor_email,action,previous_content,new_content)
 values(p_company,p_event,p_role,auth.uid(),v_name,v_email,case when p_restore then 'restore' else 'save' end,
 jsonb_build_object('subject',coalesce(v_old.subject,v_default.subject),'body',coalesce(v_old.body,v_default.body),'revision',coalesce(v_old.revision,0)),
 jsonb_build_object('subject',v_new.subject,'body',v_new.body,'revision',v_new.revision));
 return v_new;
end $$;
revoke all on function public.mei_save_email_template(uuid,text,text,text,text,integer,boolean) from public,anon;
grant execute on function public.mei_save_email_template(uuid,text,text,text,text,integer,boolean) to authenticated;

create table public.mei_email_tests(
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.mei_companies(id),
 user_id uuid not null, event text not null,recipient_role text not null,
 created_at timestamptz not null default now(),status text not null default 'pending',
 provider_message_id text, error text
);
create index mei_email_tests_user_time on public.mei_email_tests(user_id,created_at desc);
alter table public.mei_email_tests enable row level security;
create policy email_tests_read on public.mei_email_tests for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.mei_email_owners o where o.company_id=mei_email_tests.company_id and o.user_id=(select auth.uid())));
grant select on public.mei_email_tests to authenticated;
revoke all on public.mei_email_tests from anon;
revoke insert,update,delete on public.mei_email_tests from authenticated;
grant all on public.mei_email_tests to service_role;
create or replace function public.mei_reserve_email_test(p_company uuid,p_event text,p_role text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.mei_email_owners o join public.mei_profiles p on p.id=o.user_id where o.company_id=p_company and o.user_id=auth.uid() and p.role='company') then raise exception 'Somente a Empresa principal pode enviar testes' using errcode='42501'; end if;
 if not exists(select 1 from public.mei_email_defaults where event=p_event and recipient_role=p_role) then raise exception 'Modelo inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('email-test:'||auth.uid()::text,0));
 if exists(select 1 from public.mei_email_tests where user_id=auth.uid() and created_at>now()-interval '30 seconds') or
 (select count(*) from public.mei_email_tests where user_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then
 raise exception 'Aguarde 30 segundos entre testes (máximo de 20 por hora)'; end if;
 insert into public.mei_email_tests(company_id,user_id,event,recipient_role) values(p_company,auth.uid(),p_event,p_role) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.mei_reserve_email_test(uuid,text,text) from public,anon;
grant execute on function public.mei_reserve_email_test(uuid,text,text) to authenticated;

-- Override Supabase default grants, including TRUNCATE/TRIGGER/REFERENCES.
revoke all on public.mei_email_owners,public.mei_email_defaults,public.mei_email_templates,public.mei_email_template_audit,public.mei_email_tests from public,anon,authenticated;
grant select on public.mei_email_owners,public.mei_email_defaults,public.mei_email_templates,public.mei_email_template_audit,public.mei_email_tests to authenticated;
revoke all on sequence public.mei_email_template_audit_id_seq from public,anon,authenticated;
