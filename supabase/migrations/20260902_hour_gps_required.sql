-- v29: GPS obrigatório para registrar entrada e saída por hora.
alter table public.mei_hour_entries
  add column if not exists start_latitude numeric(9,6),
  add column if not exists start_longitude numeric(9,6),
  add column if not exists start_accuracy_meters numeric(8,2),
  add column if not exists start_location_captured_at timestamptz,
  add column if not exists end_latitude numeric(9,6),
  add column if not exists end_longitude numeric(9,6),
  add column if not exists end_accuracy_meters numeric(8,2),
  add column if not exists end_location_captured_at timestamptz;

-- Remove a API anterior, que aceitava marcação sem coordenadas.
drop function if exists public.mei_start_hour(uuid,uuid);
drop function if exists public.mei_end_hour(uuid,uuid);

create or replace function public.mei_start_hour(p_contract uuid, p_session uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric)
returns public.mei_hour_entries language plpgsql security definer set search_path=public as $$
declare c public.mei_contracts; e public.mei_hour_entries;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy <= 0 or p_accuracy > 100 then raise exception 'Localização GPS inválida ou imprecisa'; end if;
  select * into c from public.mei_contracts where id=p_contract and mei_id=auth.uid() and model='hour' and status='active';
  if not found then raise exception 'Contrato não autorizado'; end if;
  if exists(select 1 from public.mei_hour_entries where mei_id=auth.uid() and ended_at is null) then raise exception 'Já existe uma execução por hora em andamento'; end if;
  insert into public.mei_hour_entries(contract_id,mei_id,start_hour_rate,start_session_id,start_latitude,start_longitude,start_accuracy_meters,start_location_captured_at)
  values(c.id,auth.uid(),c.hour_rate,p_session,p_latitude,p_longitude,p_accuracy,now()) returning * into e;
  perform public.mei_audit('hour_started','hour_entry',e.id::text,jsonb_build_object('contract_id',c.id,'server_time',e.started_at,'gps',jsonb_build_object('latitude',e.start_latitude,'longitude',e.start_longitude,'accuracy_meters',e.start_accuracy_meters,'captured_at',e.start_location_captured_at)));
  return e;
end $$;

create or replace function public.mei_end_hour(p_entry uuid, p_session uuid, p_latitude numeric, p_longitude numeric, p_accuracy numeric)
returns public.mei_hour_entries language plpgsql security definer set search_path=public as $$
declare e public.mei_hour_entries;
begin
  if auth.uid() is null then raise exception 'Sessão inválida'; end if;
  if p_latitude is null or p_longitude is null or p_accuracy is null or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy <= 0 or p_accuracy > 100 then raise exception 'Localização GPS inválida ou imprecisa'; end if;
  update public.mei_hour_entries set ended_at=now(),end_session_id=p_session,end_latitude=p_latitude,end_longitude=p_longitude,end_accuracy_meters=p_accuracy,end_location_captured_at=now() where id=p_entry and mei_id=auth.uid() and ended_at is null returning * into e;
  if not found then raise exception 'Registro não encontrado ou já encerrado'; end if;
  perform public.mei_audit('hour_ended','hour_entry',e.id::text,jsonb_build_object('server_time',e.ended_at,'gps',jsonb_build_object('latitude',e.end_latitude,'longitude',e.end_longitude,'accuracy_meters',e.end_accuracy_meters,'captured_at',e.end_location_captured_at)));
  return e;
end $$;

revoke execute on function public.mei_start_hour(uuid,uuid,numeric,numeric,numeric) from public, anon;
revoke execute on function public.mei_end_hour(uuid,uuid,numeric,numeric,numeric) from public, anon;
grant execute on function public.mei_start_hour(uuid,uuid,numeric,numeric,numeric) to authenticated;
grant execute on function public.mei_end_hour(uuid,uuid,numeric,numeric,numeric) to authenticated;
