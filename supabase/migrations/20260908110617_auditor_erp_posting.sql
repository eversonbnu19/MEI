-- v32: confirmação de lançamento da NFSe no ERP pela Auditoria.
create table public.mei_erp_postings (
  closure_id uuid primary key references public.mei_closures(id) on delete cascade,
  posted_at timestamptz not null default now(),
  posted_by uuid not null references public.mei_profiles(id)
);

alter table public.mei_erp_postings enable row level security;

create policy "erp postings visible to related users"
on public.mei_erp_postings for select to authenticated using (
  exists (
    select 1 from public.mei_closures c
    where c.id=closure_id and (
      c.mei_id=auth.uid()
      or public.mei_is_company_user(c.company_id)
      or exists (
        select 1 from public.mei_company_auditors a
        where a.company_id=c.company_id and a.user_id=auth.uid()
      )
    )
  )
);

create or replace function public.mei_mark_erp_posted(p_closure uuid)
returns public.mei_erp_postings
language plpgsql security definer set search_path=public as $$
declare v_closure public.mei_closures%rowtype; v_posting public.mei_erp_postings%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_closure from public.mei_closures where id=p_closure;
  if v_closure.id is null or v_closure.status<>'sent_to_payment' then
    raise exception 'Fechamento não está disponível para lançamento no ERP';
  end if;
  if not exists (
    select 1 from public.mei_company_auditors
    where company_id=v_closure.company_id and user_id=auth.uid()
  ) then raise exception 'Auditoria não autorizada'; end if;
  if exists (select 1 from public.mei_erp_postings where closure_id=p_closure) then
    raise exception 'NFSe já foi lançada no ERP';
  end if;
  insert into public.mei_erp_postings(closure_id,posted_by)
  values(p_closure,auth.uid()) returning * into v_posting;
  perform public.mei_audit('invoice_erp_posted','closure',p_closure::text,
    jsonb_build_object('posted_at',v_posting.posted_at,'posted_by',auth.uid()));
  return v_posting;
end $$;

revoke execute on function public.mei_mark_erp_posted(uuid) from public, anon;
grant execute on function public.mei_mark_erp_posted(uuid) to authenticated;

alter table public.mei_notifications
  drop constraint if exists mei_notifications_event_check;
alter table public.mei_notifications
  add constraint mei_notifications_event_check
  check (event in ('closure_created','invoice_sent','invoice_received','sent_to_payment','erp_posted'));
