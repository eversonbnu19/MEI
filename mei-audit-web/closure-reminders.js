import {escapeHtml as esc} from './email-core.mjs?v=37';
import {nextPeriods,localDate,validateSchedule} from './closure-reminders-core.mjs?v=37';
const fmt=s=>String(s).split('-').reverse().join('/');
export async function mountClosureReminders({sb,cid,shell,tabs}){
 const [{data:contracts,error:ce},{data:settings,error:se}]=await Promise.all([
 sb.from('mei_contracts').select('id,code,service,start_date,status').eq('company_id',cid).eq('model','hour').order('code'),
 sb.from('mei_closure_reminder_settings').select('*').eq('company_id',cid)]);
 if(ce||se)throw ce||se;
 shell('<section class="card"><h1>Lembretes de fechamento</h1><p>Configure cada contrato por hora. A Empresa principal recebe um único e-mail com os contratos e períodos que ainda têm horas sem fechamento, além do aviso no painel.</p><p class="meta">Envio às <b>9h de Brasília</b>, inclusive em fins de semana. Um reforço é enviado após <b>3 dias</b> se a pendência continuar. O sistema não realiza o fechamento automaticamente.</p><p class="meta">Escolha o encerramento do período e o dia do aviso. O aviso ocorre após o encerramento, no mês seguinte quando necessário. Dias 29, 30 e 31 são ajustados ao último dia do mês. A vigência considera a data do aviso; configurações novas entram na próxima execução diária.</p></section><div id="reminderContracts"></div><section class="card"><h2>Últimos avisos por e-mail</h2><div id="reminderHistory"></div></section>',tabs);
 const host=document.querySelector('#reminderContracts');
 if(!contracts.length)host.innerHTML='<section class="card">Nenhum contrato por hora cadastrado.</section>';
 for(const contract of contracts){
  const saved=settings.find(s=>s.contract_id===contract.id);
  const initial=saved||{enabled:false,frequency:'monthly',end_day_one:31,notify_day_one:1,end_day_two:31,notify_day_two:1,effective_from:contract.start_date>localDate(new Date())?contract.start_date:localDate(new Date())};
  let revision=saved?.revision||0,baseline;
  const card=document.createElement('section');card.className='card reminder-model';
  card.innerHTML='<h2>'+esc(contract.code)+'</h2><p>'+esc(contract.service)+(contract.status!=='active'?' • Contrato inativo':'')+'</p>'+
  '<label class="reminder-enable"><input type="checkbox" data-field="enabled"> Ativar lembrete neste contrato</label>'+
  '<div class="two"><div class="field"><label>Frequência<select data-field="frequency"><option value="monthly">Mensal</option><option value="fortnightly">Quinzenal</option></select></label></div>'+
  '<div class="field"><label>Vigência a partir de<input type="date" data-field="effective_from" min="'+esc(contract.start_date)+'"></label></div></div>'+
  '<div class="two"><div class="field"><label>Dia de encerramento do período<input type="number" data-field="end_day_one" min="1" max="31"></label></div><div class="field"><label>Dia do aviso<input type="number" data-field="notify_day_one" min="1" max="31"></label></div></div>'+
  '<div class="reminder-second"><p class="meta">Na frequência quinzenal, o primeiro encerramento deve ser até dia 27 para garantir dois períodos também em fevereiro.</p><div class="two"><div class="field"><label>Dia do segundo encerramento<input type="number" data-field="end_day_two" min="2" max="31"></label></div><div class="field"><label>Dia do segundo aviso<input type="number" data-field="notify_day_two" min="1" max="31"></label></div></div></div>'+
  '<div class="reminder-preview"></div><button class="pri" data-save-reminder>Salvar configuração</button><p class="reminder-status" role="status"></p>';
  host.append(card);
  for(const [k,v]of Object.entries(initial)){const input=card.querySelector('[data-field="'+k+'"]');if(input){if(k==='enabled')input.checked=v;else input.value=v??'';}}
  const read=()=>Object.fromEntries([...card.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.type==='checkbox'?x.checked:x.type==='number'?Number(x.value):x.value]));
  baseline=JSON.stringify(read());
  function update(){
   const value=read();card.dataset.dirty=String(JSON.stringify(value)!==baseline);
   card.querySelector('.reminder-second').hidden=value.frequency!=='fortnightly';
   card.querySelector('[data-field="end_day_one"]').max=value.frequency==='fortnightly'?'27':'31';
   try{
    validateSchedule(value);
    const examples=nextPeriods(value,localDate(new Date()));
    card.querySelector('.reminder-preview').innerHTML='<h3>Próximos períodos e avisos</h3>'+examples.map(p=>'<p>'+fmt(p.period_start)+' a '+fmt(p.period_end)+' → aviso em <b>'+fmt(p.due_date)+' às 9h</b></p>').join('')+(value.enabled?'':'<p class="meta">Lembrete desativado. Ative e salve para iniciar.</p>');
   }catch(e){card.querySelector('.reminder-preview').textContent=e.message;}
  }
  card.querySelectorAll('[data-field]').forEach(x=>x.oninput=update);
  card.querySelector('[data-field="frequency"]').onchange=()=>{
   const v=read();if(v.frequency==='fortnightly'&&v.end_day_one>27){card.querySelector('[data-field="end_day_one"]').value=15;card.querySelector('[data-field="notify_day_one"]').value=16;}
   if(v.frequency==='fortnightly'){if(v.end_day_two<=v.end_day_one)card.querySelector('[data-field="end_day_two"]').value=31;if(!v.notify_day_two)card.querySelector('[data-field="notify_day_two"]').value=1;}
   update();
  };
  card.querySelector('[data-save-reminder]').onclick=async()=>{
   const btn=card.querySelector('[data-save-reminder]'),status=card.querySelector('.reminder-status');
   try{
    const value=read();validateSchedule(value);
    if(value.enabled&&contract.status!=='active')throw new Error('Ative o contrato antes de habilitar o lembrete.');
    btn.disabled=true;status.textContent='Salvando...';
    const {data,error}=await sb.rpc('mei_save_closure_reminder',{p_contract:contract.id,p_settings:value,p_expected_revision:revision});
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;revision=result.revision;baseline=JSON.stringify(value);update();
    status.textContent=value.enabled?'Configuração salva. Os avisos seguirão os períodos acima.':'Configuração salva. Lembrete desativado.';
   }catch(e){status.textContent=e.message||String(e);}
   finally{btn.disabled=false;}
  };
  update();
 }
 const {data:history,error:he}=await sb.from('mei_closure_reminder_deliveries').select('id,delivery_date,status,attempts,error,sent_at').eq('company_id',cid).order('created_at',{ascending:false}).limit(20);
 if(he)throw he;
 const labels={sent:'Enviado',failed:'Falha de envio',pending:'Aguardando envio',suppressed:'Cancelado: pendências alteradas'};
 document.querySelector('#reminderHistory').innerHTML=history.length?history.map(h=>'<p>'+fmt(h.delivery_date)+' • '+esc(labels[h.status]||h.status)+(h.error?' • '+esc(h.error):'')+'</p>').join(''):'Nenhum aviso enviado. Os lembretes começam após ativar e salvar um contrato.';
}
export async function mountPendingReminder({sb,cid}){
 const {data,error}=await sb.rpc('mei_pending_closure_reminders',{p_company:cid});
 if(error)throw error;if(!data?.length)return;
 const card=document.createElement('section');card.className='card reminder-alert';card.id='pendingClosureReminder';
 card.innerHTML='<h2>Há horas aguardando fechamento</h2><p>Confira os contratos e períodos pendentes:</p><div class="table"><table><thead><tr><th>Contrato / MEI</th><th>Período</th><th>Horas sem fechamento</th></tr></thead><tbody>'+data.map(x=>'<tr><td>'+esc(x.contract_code)+'<small>'+esc(x.mei_name)+'</small></td><td>'+fmt(x.period_start)+' a '+fmt(x.period_end)+'</td><td>'+esc(Number(x.total_hours).toLocaleString('pt-BR',{maximumFractionDigits:2}))+(x.open_entries?' • '+esc(x.open_entries)+' registro(s) sem saída':'')+'</td></tr>').join('')+'</tbody></table></div><button class="pri">Ver fechamentos</button>';
 document.querySelector('main.wrap')?.prepend(card);
 card.querySelector('button').onclick=()=>document.querySelector('[data-tab="fechamentos"]')?.click();
}
