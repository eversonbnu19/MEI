-- v34: cada evento transacional pode ter apenas um envio ativo por destinatário.
-- Linhas antigas repetidas permanecem no histórico, marcadas como suprimidas.
alter table public.mei_notifications
  drop constraint if exists mei_notifications_status_check;
alter table public.mei_notifications
  add constraint mei_notifications_status_check
  check (status in ('pending','sent','failed','suppressed'));

with ranked as (
  select id,row_number() over (
    partition by closure_id,event,email
    order by created_at,id
  ) as position
  from public.mei_notifications
  where status in ('pending','sent')
)
update public.mei_notifications n
set status='suppressed',
    error=coalesce(n.error,'Envio duplicado suprimido pela proteção v34.'),
    updated_at=now()
from ranked r
where n.id=r.id and r.position>1;

create unique index if not exists mei_notifications_active_delivery_unique
on public.mei_notifications(closure_id,event,email)
where status in ('pending','sent');
