-- v31: o aviso à auditoria é emitido no encaminhamento efetivo ao pagamento.
-- O histórico v30 permanece reenviável para preservar a trilha de auditoria.
alter table public.mei_notifications
  drop constraint if exists mei_notifications_event_check;

alter table public.mei_notifications
  add constraint mei_notifications_event_check
  check (event in ('closure_created','invoice_sent','invoice_received','sent_to_payment'));
