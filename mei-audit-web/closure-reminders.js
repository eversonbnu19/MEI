import {escapeHtml as esc} from './email-core.mjs?v=38';
import {nextPeriods,localDate,validateSchedule} from './closure-reminders-core.mjs?v=38';
const fmt=s=>String(s).split('-').reverse().join('/');
const label=c=>[c.code,c.mei_profiles?.name||'MEI',c.service].join(' — ');
export async function mountClosureReminders({sb,cid,shell,tabs}){
 const [{data:contractData,error:ce},{data:settingData,error:se}]=await Promise.all([
 sb.from('mei_contracts').select('id,code,service,start_date,status,mei_profiles!mei_contracts_mei_id_fkey(name)').eq('company_id',cid).eq('model','hour').order('code'),
 sb.from('mei_closure_reminder_settings').select('*').eq('company_id',cid)]);
 if(ce||se)throw ce||se;
 const contracts=contractData||[];let settings=settingData||[],source=null,baseline='',busy=false;
 const active=()=>contracts.filter(c=>c.status==='active');
 const visible=()=>settings.filter(s=>!s.deleted_at);
 const contractById=id=>contracts.find(c=>c.id===id);
 shell('<section class="card"><h1>Lembretes de fechamento</h1><p>Inclua e edite os lembretes escolhendo um contrato ativo por hora. Cada contrato pode ter um lembrete, com datas e frequência próprias.</p><p class="meta">A Empresa principal recebe um e-mail consolidado às <b>9h de Brasília</b> e um aviso no painel. Há um reforço após <b>3 dias</b> se as horas continuarem sem fechamento.</p><button class="pri" id="newClosureReminder">Novo lembrete</button><p id="reminderListStatus" role="status"></p></section><section class="card"><h2>Lembretes cadastrados</h2><div id="reminderList"></div></section><section id="reminderEditor" class="card reminder-model" hidden></section><section class="card"><h2>Últimos avisos por e-mail</h2><div id="reminderHistory"></div></section>',tabs);
 const editor=document.querySelector('#reminderEditor'),listStatus=document.querySelector('#reminderListStatus');
 const canLeave=()=>!editor.querySelector('[data-field]')||editor.dataset.dirty!=='true'||confirm('Há alterações não salvas. Sair sem salvar?');
 function closeEditor(){editor.hidden=true;editor.replaceChildren();editor.dataset.dirty='false';source=null;baseline='';}
 function replaceSetting(result){
  settings=settings.filter(s=>s.contract_id!==result.contract_id);settings.push(result);
 }
 async function refreshSettings(){
  const {data,error}=await sb.from('mei_closure_reminder_settings').select('*').eq('company_id',cid);
  if(error)throw error;settings=data||[];
 }
 function renderList(){
  const rows=visible().map(s=>{
   const c=contractById(s.contract_id),isActive=c?.status==='active';
   return '<tr><td>'+esc(c?label(c):'Contrato indisponível')+'</td><td>'+(s.frequency==='monthly'?'Mensal':'Quinzenal')+'</td><td>'+(s.frequency==='monthly'?'Encerramento dia '+s.end_day_one+' • aviso dia '+s.notify_day_one:'Encerramentos: '+s.end_day_one+' e '+s.end_day_two+' • avisos: '+s.notify_day_one+' e '+s.notify_day_two)+'</td><td>'+(!isActive?'Contrato inativo':s.enabled?'Ativo':'Desativado')+'</td><td><div class="email-actions"><button class="sec" data-list-action="edit" data-contract="'+esc(s.contract_id)+'">Editar</button><button class="sec" data-list-action="toggle" data-contract="'+esc(s.contract_id)+'" '+(!isActive&&!s.enabled?'disabled':'')+'>'+(s.enabled?'Desativar':'Ativar')+'</button><button class="danger" data-list-action="delete" data-contract="'+esc(s.contract_id)+'">Excluir</button></div></td></tr>';
  }).join('');
  document.querySelector('#reminderList').innerHTML=rows?'<div class="table"><table><thead><tr><th>Contrato / MEI / serviço</th><th>Frequência</th><th>Dias configurados</th><th>Situação</th><th>Ações</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p>Nenhum lembrete cadastrado. Clique em <b>Novo lembrete</b> para escolher um contrato.</p>';
  document.querySelectorAll('[data-list-action]').forEach(b=>b.onclick=async()=>{
   if(busy||!canLeave())return;
   const row=settings.find(s=>s.contract_id===b.dataset.contract);
   if(b.dataset.listAction==='edit')return openEditor(row);
   const apply=async()=>{
   if(busy)return;
   try{
    busy=true;b.disabled=true;listStatus.textContent='Salvando...';
    const {data,error}=await sb.rpc('mei_manage_closure_reminder',{p_action:b.dataset.listAction,p_source_contract:row.contract_id,p_target_contract:null,p_settings:{enabled:!row.enabled},p_expected_revision:row.revision,p_expected_target_revision:0});
    if(error)throw error;
    replaceSetting(Array.isArray(data)?data[0]:data);closeEditor();renderList();
    listStatus.textContent=b.dataset.listAction==='delete'?'Lembrete excluído. Histórico preservado.':row.enabled?'Lembrete desativado.':'Lembrete ativado.';
   }catch(e){listStatus.textContent=e.message||String(e);b.disabled=false;}
   finally{busy=false;}
   };
   if(b.dataset.listAction==='delete'){
    listStatus.innerHTML='Excluir este lembrete? Os próximos avisos serão interrompidos e o histórico já enviado será preservado. <button type="button" class="danger" id="confirmReminderDelete">Confirmar exclusão</button> <button type="button" class="sec" id="cancelReminderDelete">Cancelar</button>';
    document.querySelector('#confirmReminderDelete').onclick=apply;
    document.querySelector('#cancelReminderDelete').onclick=()=>listStatus.textContent='Exclusão cancelada.';
   }else await apply();
  });
 }
 function openEditor(row=null){
  if(busy)return;
  source=row;
  const available=active().filter(c=>c.id===row?.contract_id||!visible().some(s=>s.contract_id===c.id));
  if(!available.length){closeEditor();listStatus.textContent=active().length?'Todos os contratos ativos por hora já possuem um lembrete. Edite um lembrete existente.':'Cadastre ou ative um contrato por hora na aba Contratos para incluir um lembrete.';return;}
  listStatus.textContent='';
  const today=localDate(new Date());
  const initial=row||{contract_id:'',enabled:true,frequency:'monthly',end_day_one:31,notify_day_one:1,end_day_two:31,notify_day_two:1,effective_from:today};
  editor.hidden=false;
  editor.innerHTML='<h2>'+(row?'Editar lembrete':'Novo lembrete')+'</h2><form id="closureReminderForm">'+
  '<div class="field"><label>Contrato<select data-field="contract_id" required><option value="">Selecione um contrato ativo por hora</option>'+available.map(c=>'<option value="'+esc(c.id)+'">'+esc(label(c))+'</option>').join('')+'</select></label></div>'+
  '<p class="meta" id="reminderBindingNotice"></p>'+
  '<label class="reminder-enable"><input type="checkbox" data-field="enabled"> Lembrete ativo</label>'+
  '<div class="two"><div class="field"><label>Frequência<select data-field="frequency"><option value="monthly">Mensal</option><option value="fortnightly">Quinzenal</option></select></label></div><div class="field"><label>Vigência a partir de<input type="date" data-field="effective_from" required></label></div></div>'+
  '<div class="two"><div class="field"><label>Dia de encerramento do período<input type="number" data-field="end_day_one" min="1" max="31" required></label></div><div class="field"><label>Dia do aviso<input type="number" data-field="notify_day_one" min="1" max="31" required></label></div></div>'+
  '<div class="reminder-second"><p class="meta">O primeiro encerramento quinzenal deve ser até dia 27 para manter dois períodos em fevereiro.</p><div class="two"><div class="field"><label>Dia do segundo encerramento<input type="number" data-field="end_day_two" min="2" max="31"></label></div><div class="field"><label>Dia do segundo aviso<input type="number" data-field="notify_day_two" min="1" max="31"></label></div></div></div>'+
  '<p class="meta">Avisos após o encerramento, no mês seguinte quando necessário. Dias 29, 30 e 31 são ajustados ao último dia do mês.</p><div class="reminder-preview"></div><div class="email-actions"><button class="pri" type="submit">Salvar lembrete</button><button class="sec" type="button" id="cancelReminderEdit">Cancelar</button></div><p class="reminder-status" role="status"></p></form>';
  for(const [k,v]of Object.entries(initial)){const input=editor.querySelector('[data-field="'+k+'"]');if(input){if(k==='enabled')input.checked=v;else input.value=v??'';}}
  const read=()=>Object.fromEntries([...editor.querySelectorAll('[data-field]')].map(x=>[x.dataset.field,x.type==='checkbox'?x.checked:x.type==='number'?Number(x.value):x.value]));
  baseline=JSON.stringify(read());
  function update(){
   const value=read(),c=contractById(value.contract_id),moving=source&&source.contract_id!==value.contract_id&&value.contract_id;
   editor.dataset.dirty=String(JSON.stringify(value)!==baseline);
   editor.querySelector('.reminder-second').hidden=value.frequency!=='fortnightly';
   editor.querySelector('[data-field="end_day_one"]').max=value.frequency==='fortnightly'?'27':'31';
   editor.querySelectorAll('[data-field="end_day_two"],[data-field="notify_day_two"]').forEach(x=>{x.disabled=value.frequency!=='fortnightly';x.required=value.frequency==='fortnightly';});
   editor.querySelector('[data-field="effective_from"]').min=c?.start_date||'2000-01-01';
   editor.querySelector('#reminderBindingNotice').textContent=moving?'Troca de contrato: as datas e a frequência preenchidas serão mantidas. Só entrarão avisos a partir de hoje. O histórico continuará no contrato original.':source?'Você pode alterar o contrato, a frequência e as datas antes de salvar.':'Escolha um contrato para este novo lembrete.';
   try{
    validateSchedule(value);
    if(!c)throw new Error('Selecione um contrato para visualizar os próximos avisos.');
    if(value.effective_from<c.start_date)throw new Error('A vigência deve começar em '+fmt(c.start_date)+' ou depois, conforme o contrato selecionado.');
    const examples=nextPeriods({...value,binding_from:moving?today:source?.binding_from},today);
    editor.querySelector('.reminder-preview').innerHTML='<h3>Conferir antes de salvar</h3><p><b>'+esc(label(c))+'</b></p>'+examples.map(p=>'<p>'+fmt(p.period_start)+' a '+fmt(p.period_end)+' → aviso em <b>'+fmt(p.due_date)+' às 9h</b></p>').join('')+(value.enabled?'':'<p>Lembrete desativado.</p>');
   }catch(e){editor.querySelector('.reminder-preview').textContent=e.message;}
  }
  editor.querySelectorAll('[data-field]').forEach(x=>x.oninput=update);
  editor.querySelector('[data-field="frequency"]').onchange=()=>{
   const v=read();
   if(v.frequency==='fortnightly'){if(v.end_day_one>27){editor.querySelector('[data-field="end_day_one"]').value=15;editor.querySelector('[data-field="notify_day_one"]').value=16;}if(v.end_day_two<=v.end_day_one)editor.querySelector('[data-field="end_day_two"]').value=31;if(!v.notify_day_two)editor.querySelector('[data-field="notify_day_two"]').value=1;}
   update();
  };
  editor.querySelector('#cancelReminderEdit').onclick=()=>{if(!busy&&canLeave())closeEditor();};
  editor.querySelector('form').onsubmit=async event=>{
   event.preventDefault();if(busy)return;
   const status=editor.querySelector('.reminder-status');
   try{
    const value=read(),c=active().find(c=>c.id===value.contract_id);validateSchedule(value);
    if(!c)throw new Error('Selecione um contrato ativo por hora.');
    if(value.effective_from<c.start_date)throw new Error('A vigência deve começar na data do contrato selecionado ou depois.');
    if(visible().some(s=>s.contract_id===c.id&&s.contract_id!==source?.contract_id))throw new Error('Este contrato já possui um lembrete. Edite o existente.');
    busy=true;editor.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='Salvando...';
    const target=settings.find(s=>s.contract_id===c.id),previous=source?.contract_id;
    const {data,error}=await sb.rpc('mei_manage_closure_reminder',{p_action:'save',p_source_contract:previous||null,p_target_contract:c.id,p_settings:value,p_expected_revision:source?.revision||0,p_expected_target_revision:target?.revision||0});
    if(error)throw error;
    // Refresh both bindings after a move; a refresh failure must not invite a second save.
    const saved=Array.isArray(data)?data[0]:data;replaceSetting(saved);
    if(previous&&previous!==saved.contract_id)settings=settings.filter(s=>s.contract_id!==previous);
    closeEditor();renderList();
    listStatus.textContent=previous&&previous!==saved.contract_id?'Contrato do lembrete alterado. Datas e frequência mantidas; histórico preservado.':'Lembrete salvo.';
    try{await refreshSettings();renderList();}catch(e){listStatus.textContent+=' Atualize a página antes de fazer outra alteração.';}
   }catch(e){status.textContent=e.message||String(e);}
   finally{busy=false;editor.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  update();editor.scrollIntoView({behavior:'smooth',block:'start'});
 }
 document.querySelector('#newClosureReminder').onclick=()=>{if(!busy&&canLeave())openEditor();};
 renderList();
 const {data:history,error:he}=await sb.from('mei_closure_reminder_deliveries').select('id,delivery_date,status,error,items').eq('company_id',cid).order('created_at',{ascending:false}).limit(20);
 if(he)throw he;
 const labels={sent:'Enviado',failed:'Falha de envio',pending:'Aguardando envio',suppressed:'Cancelado: pendências alteradas'};
 document.querySelector('#reminderHistory').innerHTML=history?.length?history.map(h=>'<details><summary>'+fmt(h.delivery_date)+' • '+esc(labels[h.status]||h.status)+'</summary>'+((h.items||[]).map(i=>'<p>'+esc(i.contract_code)+' — '+esc(i.mei_name)+' • '+fmt(i.period_start)+' a '+fmt(i.period_end)+'</p>').join(''))+(h.error?'<p>'+esc(h.error)+'</p>':'')+'</details>').join(''):'Nenhum aviso enviado. Os registros já enviados permanecerão no contrato original.';
}
export async function mountPendingReminder({sb,cid}){
 const {data,error}=await sb.rpc('mei_pending_closure_reminders',{p_company:cid});
 if(error)throw error;if(!data?.length)return;
 const card=document.createElement('section');card.className='card reminder-alert';card.id='pendingClosureReminder';
 card.innerHTML='<h2>Há horas aguardando fechamento</h2><p>Confira os contratos e períodos pendentes:</p><div class="table"><table><thead><tr><th>Contrato / MEI</th><th>Período</th><th>Horas sem fechamento</th></tr></thead><tbody>'+data.map(x=>'<tr><td>'+esc(x.contract_code)+'<small>'+esc(x.mei_name)+'</small></td><td>'+fmt(x.period_start)+' a '+fmt(x.period_end)+'</td><td>'+esc(Number(x.total_hours).toLocaleString('pt-BR',{maximumFractionDigits:2}))+(x.open_entries?' • '+esc(x.open_entries)+' registro(s) sem saída':'')+'</td></tr>').join('')+'</tbody></table></div><button class="pri">Ver fechamentos</button>';
 document.querySelector('main.wrap')?.prepend(card);
 card.querySelector('button').onclick=()=>document.querySelector('[data-tab="fechamentos"]')?.click();
}
