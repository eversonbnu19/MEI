-- v28: inclusões pela Empresa durante a pré-conferência.
-- As funções usam o contrato e a tabela de preços como fonte da verdade e
-- registram o motivo e a origem manual para auditoria. Valores e minutos
-- continuam sendo gerados pelas próprias tabelas.
alter table public.mei_hour_entries add column if not exists entry_origin text not null default 'automatic';
alter table public.mei_piece_entries add column if not exists entry_origin text not null default 'automatic';
alter table public.mei_hour_entries add constraint mei_hour_entries_entry_origin_check check (entry_origin in ('automatic','manual','adjusted')) not valid;
alter table public.mei_piece_entries add constraint mei_piece_entries_entry_origin_check check (entry_origin in ('automatic','manual','adjusted')) not valid;
create or replace function public.mei_company_add_hour_entry(
  p_contract uuid, p_started_at timestamptz, p_ended_at timestamptz, p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare v_contract public.mei_contracts%rowtype; v_entry public.mei_hour_entries;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_contract from public.mei_contracts where id=p_contract;
  if v_contract.id is null or not public.mei_is_company_user(v_contract.company_id) then raise exception 'Contrato não autorizado'; end if;
  if p_reason is null or btrim(p_reason)='' or p_ended_at is null or p_ended_at<=p_started_at then raise exception 'Informe horários válidos e motivo'; end if;
  insert into public.mei_hour_entries(contract_id,mei_id,started_at,ended_at,start_hour_rate,adjustment_reason,adjusted_at,adjusted_by,entry_origin)
  values(p_contract,v_contract.mei_id,p_started_at,p_ended_at,v_contract.hour_rate,trim(p_reason),now(),auth.uid(),'manual') returning * into v_entry;
  perform public.mei_audit('hour_entry_added','hour_entry',v_entry.id::text,jsonb_build_object('origin','manual','reason',trim(p_reason),'entry',jsonb_build_object('started_at',v_entry.started_at,'ended_at',v_entry.ended_at,'minutes_worked',v_entry.minutes_worked,'total_value',v_entry.total_value)));
end $$;

create or replace function public.mei_company_add_piece_entry(
  p_contract uuid, p_piece_rate uuid, p_lot text, p_quantity numeric, p_produced_at timestamptz, p_reason text
) returns void language plpgsql security definer set search_path=public as $$
declare v_contract public.mei_contracts%rowtype; v_rate public.mei_piece_rates%rowtype; v_entry public.mei_piece_entries;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  select * into v_contract from public.mei_contracts where id=p_contract;
  select * into v_rate from public.mei_piece_rates where id=p_piece_rate and contract_id=p_contract and active=true;
  if v_contract.id is null or v_rate.id is null or not public.mei_is_company_user(v_contract.company_id) then raise exception 'Contrato ou peça não autorizada'; end if;
  if p_reason is null or btrim(p_reason)='' or coalesce(btrim(p_lot),'')='' or p_quantity<=0 then raise exception 'Informe lote, quantidade e motivo'; end if;
  insert into public.mei_piece_entries(contract_id,mei_id,piece_rate_id,piece_name,lot_number,quantity,unit_rate,produced_at,adjustment_reason,adjusted_at,adjusted_by,entry_origin)
  values(p_contract,v_contract.mei_id,v_rate.id,v_rate.piece_name,trim(p_lot),p_quantity,v_rate.unit_rate,p_produced_at,trim(p_reason),now(),auth.uid(),'manual') returning * into v_entry;
  perform public.mei_audit('piece_entry_added','piece_entry',v_entry.id::text,jsonb_build_object('origin','manual','reason',trim(p_reason),'entry',jsonb_build_object('produced_at',v_entry.produced_at,'quantity',v_entry.quantity,'unit_rate',v_entry.unit_rate,'total_value',v_entry.total_value)));
end $$;

revoke execute on function public.mei_company_add_hour_entry(uuid,timestamptz,timestamptz,text) from public, anon;
revoke execute on function public.mei_company_add_piece_entry(uuid,uuid,text,numeric,timestamptz,text) from public, anon;
grant execute on function public.mei_company_add_hour_entry(uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.mei_company_add_piece_entry(uuid,uuid,text,numeric,timestamptz,text) to authenticated;
