-- v30: histórico de comunicações transacionais. Escrita exclusiva da Edge Function.
create table if not exists public.mei_notifications (
  id uuid primary key default gen_random_uuid(),
  closure_id uuid not null references public.mei_closures(id) on delete cascade,
  event text not null check (event in ('closure_created','invoice_sent','invoice_received')),
  recipient_role text not null check (recipient_role in ('company','mei','auditor')),
  email text not null,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error text,
  attempt integer not null default 1 check (attempt > 0),
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists mei_notifications_closure_created_idx on public.mei_notifications(closure_id,created_at desc);
alter table public.mei_notifications enable row level security;

-- Usuários só visualizam o histórico de fechamentos da sua empresa/MEI.
create policy "notification history for related users" on public.mei_notifications for select to authenticated using (
  exists (
    select 1 from public.mei_closures c
    where c.id=closure_id and (
      c.mei_id=auth.uid()
      or public.mei_is_company_user(c.company_id)
      or exists (select 1 from public.mei_company_auditors a where a.company_id=c.company_id and a.user_id=auth.uid())
    )
  )
);
