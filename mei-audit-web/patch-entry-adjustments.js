const sb=window.__GESTAO_SB__;
const appRoot=document.querySelector('#app');
let running=false;
let companyIdCache=null;

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const fmtDateTime=x=>x?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(x)):'—';
const toLocalInput=x=>{
  if(!x) return '';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x));
  const p=Object.fromEntries(parts.map(i=>[i.type,i.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const toIsoSaoPaulo=value=>new Date(`${value}:00-03:00`).toISOString();
const statusLabel=s=>({awaiting_invoice:'Aguardando NF',invoice_sent:'NF enviada',invoice_received:'NF confirmada',sent_to_payment:'Enviado ao pagamento',paid:'Pago'}[s]||s||'Aberto');

function roleText(){return document.querySelector('.top > div:first-child small')?.textContent||'';}
function activeTab(){return document.querySelector('.tabs .active')?.dataset?.tab||'';}
function isCompanyContracts(){return roleText().includes('Gestão da empresa')&&activeTab()==='contratos';}
function isMeiHistory(){return roleText().includes('Execução mobile')&&activeTab()==='historico';}
function isMeiHome(){return roleText().includes('Execução mobile')&&activeTab()==='inicio';}

async function getCompanyId(){
  if(companyIdCache) return companyIdCache;
  const {data:{user},error:userErr}=await sb.auth.getUser();
  if(userErr||!user) throw new Error('Sessão inválida.');
  const {data,error}=await sb.from('mei_company_users').select('company_id').eq('user_id',user.id).limit(1);
  if(error||!data?.length) throw new Error('Empresa não encontrada.');
  companyIdCache=data[0].company_id;
  return companyIdCache;
}

function lockReason(entry,closureMap){
  if(entry.is_voided) return 'Lançamento cancelado';
  if(!entry.closure_id) return '';
  const cl=closureMap.get(entry.closure_id);
  if(!cl) return 'Fechamento não localizado';
  if(cl.status!=='awaiting_invoice') return 'Bloqueado após envio da NF';
  return '';
}

function buildEditorCard(){
  let card=document.querySelector('#entryAdjustmentEditor');
  if(card) return card;
  card=document.createElement('div');
  card.className='card';
  card.id='entryAdjustmentEditor';
  card.hidden=true;
  return card;
}

function closeEditor(){
  const card=document.querySelector('#entryAdjustmentEditor');
  if(card){card.hidden=true;card.innerHTML='';}
}

async function openHourEditor(entry,contract){
  const card=buildEditorCard();
  const host=document.querySelector('#entryAdjustmentManager');
  if(!card.isConnected) host?.append(card);
  card.hidden=false;
  card.innerHTML=`<h3>Corrigir lançamento por hora</h3><p class="meta">Contrato ${esc(contract.code)} • ${esc(contract.service)}</p><div class="two"><div class="field"><label>Entrada</label><input id="adjHourStart" type="datetime-local" value="${toLocalInput(entry.started_at)}"></div><div class="field"><label>Saída</label><input id="adjHourEnd" type="datetime-local" value="${toLocalInput(entry.ended_at)}"></div></div><div class="field"><label>Motivo do ajuste</label><textarea id="adjHourReason" rows="3" placeholder="Obrigatório"></textarea></div><button class="pri" id="saveHourAdjustment">Salvar ajuste</button> <button class="sec" id="voidHourAdjustment">Cancelar lançamento</button> <button class="sec" id="closeHourAdjustment">Voltar</button>`;
  card.scrollIntoView({behavior:'smooth',block:'center'});
  document.querySelector('#closeHourAdjustment').onclick=closeEditor;
  document.querySelector('#saveHourAdjustment').onclick=async()=>{
    const start=document.querySelector('#adjHourStart').value;
    const end=document.querySelector('#adjHourEnd').value;
    const reason=document.querySelector('#adjHourReason').value.trim();
    if(!start||!end) return alert('Informe entrada e saída.');
    if(!reason) return alert('Informe o motivo do ajuste.');
    try{
      const {error}=await sb.rpc('mei_adjust_hour_entry',{p_entry:entry.id,p_started_at:toIsoSaoPaulo(start),p_ended_at:toIsoSaoPaulo(end),p_reason:reason,p_void:false});
      if(error) throw error;
      alert('Lançamento ajustado. O MEI visualizará o motivo no histórico.');
      closeEditor();
      await renderSelectedContract(contract.id,true);
    }catch(e){alert(e?.message||String(e));}
  };
  document.querySelector('#voidHourAdjustment').onclick=async()=>{
    const reason=document.querySelector('#adjHourReason').value.trim();
    if(!reason) return alert('Informe o motivo do cancelamento.');
    if(!confirm('Cancelar este lançamento por hora? O registro será preservado para auditoria.')) return;
    try{
      const {error}=await sb.rpc('mei_adjust_hour_entry',{p_entry:entry.id,p_started_at:entry.started_at,p_ended_at:entry.ended_at,p_reason:reason,p_void:true});
      if(error) throw error;
      alert('Lançamento cancelado e preservado no histórico.');
      closeEditor();
      await renderSelectedContract(contract.id,true);
    }catch(e){alert(e?.message||String(e));}
  };
}

async function openPieceEditor(entry,contract){
  const card=buildEditorCard();
  const host=document.querySelector('#entryAdjustmentManager');
  if(!card.isConnected) host?.append(card);
  card.hidden=false;
  card.innerHTML=`<h3>Corrigir lançamento por peça</h3><p class="meta">Contrato ${esc(contract.code)} • ${esc(entry.piece_name)} • lote ${esc(entry.lot_number)}</p><div class="two"><div class="field"><label>Quantidade</label><input id="adjPieceQty" type="number" min="0.001" step="0.001" value="${esc(entry.quantity)}"></div><div class="field"><label>Valor unitário contratado</label><input value="${brl(entry.unit_rate)}" disabled></div></div><div class="field"><label>Motivo do ajuste</label><textarea id="adjPieceReason" rows="3" placeholder="Obrigatório"></textarea></div><button class="pri" id="savePieceAdjustment">Salvar ajuste</button> <button class="sec" id="voidPieceAdjustment">Cancelar lançamento</button> <button class="sec" id="closePieceAdjustment">Voltar</button>`;
  card.scrollIntoView({behavior:'smooth',block:'center'});
  document.querySelector('#closePieceAdjustment').onclick=closeEditor;
  document.querySelector('#savePieceAdjustment').onclick=async()=>{
    const quantity=Number(document.querySelector('#adjPieceQty').value||0);
    const reason=document.querySelector('#adjPieceReason').value.trim();
    if(quantity<=0) return alert('Informe uma quantidade maior que zero.');
    if(!reason) return alert('Informe o motivo do ajuste.');
    try{
      const {error}=await sb.rpc('mei_adjust_piece_entry',{p_entry:entry.id,p_quantity:quantity,p_reason:reason,p_void:false});
      if(error) throw error;
      alert('Quantidade ajustada. O valor foi recalculado com a tabela contratada.');
      closeEditor();
      await renderSelectedContract(contract.id,true);
    }catch(e){alert(e?.message||String(e));}
  };
  document.querySelector('#voidPieceAdjustment').onclick=async()=>{
    const reason=document.querySelector('#adjPieceReason').value.trim();
    if(!reason) return alert('Informe o motivo do cancelamento.');
    if(!confirm('Cancelar este lançamento por peça? O registro será preservado para auditoria.')) return;
    try{
      const {error}=await sb.rpc('mei_adjust_piece_entry',{p_entry:entry.id,p_quantity:entry.quantity,p_reason:reason,p_void:true});
      if(error) throw error;
      alert('Lançamento cancelado e preservado no histórico.');
      closeEditor();
      await renderSelectedContract(contract.id,true);
    }catch(e){alert(e?.message||String(e));}
  };
}

async function renderSelectedContract(contractId,force=false){
  const host=document.querySelector('#entryAdjustmentRows');
  if(!host) return;
  if(!force&&host.dataset.contractId===contractId) return;
  host.dataset.contractId=contractId;
  host.innerHTML='<p class="meta">Carregando lançamentos...</p>';
  try{
    const cid=await getCompanyId();
    const {data:contracts,error:cErr}=await sb.from('mei_contracts').select('*').eq('company_id',cid).eq('id',contractId).limit(1);
    if(cErr||!contracts?.length) throw cErr||new Error('Contrato não encontrado.');
    const contract=contracts[0];
    const {data:closures,error:clErr}=await sb.from('mei_closures').select('id,status,period_start,period_end').eq('company_id',cid).eq('contract_id',contractId);
    if(clErr) throw clErr;
    const closureMap=new Map((closures||[]).map(c=>[c.id,c]));
    if(contract.model==='hour'){
      const {data,error}=await sb.from('mei_hour_entries').select('*').eq('contract_id',contractId).order('started_at',{ascending:false});
      if(error) throw error;
      const entries=data||[];
      host.innerHTML=`<div class="table"><table><tr><th>Dia</th><th>Entrada</th><th>Saída</th><th>Minutos</th><th>Valor</th><th>Situação</th><th>Ação</th></tr>${entries.map(e=>{
        const lock=e.ended_at?lockReason(e,closureMap):'Em andamento';
        const cl=e.closure_id?closureMap.get(e.closure_id):null;
        const state=e.is_voided?'Cancelado':cl?statusLabel(cl.status):'Aberto';
        return `<tr><td>${fmtDateTime(e.started_at).split(' ')[0]}</td><td>${fmtDateTime(e.started_at)}</td><td>${fmtDateTime(e.ended_at)}</td><td>${e.minutes_worked??'—'}</td><td>${e.is_voided?brl(0):brl(e.total_value)}</td><td>${esc(state)}${e.adjustment_reason?`<br><small>Motivo: ${esc(e.adjustment_reason)}</small>`:''}</td><td>${lock?`<span class="meta">${esc(lock)}</span>`:`<button class="sec" data-edit-hour="${e.id}">Editar</button>`}</td></tr>`;
      }).join('')||'<tr><td colspan="7">Nenhum lançamento.</td></tr>'}</table></div>`;
      host.querySelectorAll('[data-edit-hour]').forEach(btn=>{
        const entry=entries.find(e=>e.id===btn.dataset.editHour);
        btn.onclick=()=>openHourEditor(entry,contract);
      });
    }else{
      const {data,error}=await sb.from('mei_piece_entries').select('*').eq('contract_id',contractId).order('produced_at',{ascending:false});
      if(error) throw error;
      const entries=data||[];
      host.innerHTML=`<div class="table"><table><tr><th>Data</th><th>Peça</th><th>Lote</th><th>Quantidade</th><th>Valor unitário</th><th>Total</th><th>Situação</th><th>Ação</th></tr>${entries.map(e=>{
        const lock=lockReason(e,closureMap);
        const cl=e.closure_id?closureMap.get(e.closure_id):null;
        const state=e.is_voided?'Cancelado':cl?statusLabel(cl.status):'Aberto';
        return `<tr><td>${fmtDateTime(e.produced_at)}</td><td>${esc(e.piece_name)}</td><td>${esc(e.lot_number)}</td><td>${esc(e.quantity)}</td><td>${brl(e.unit_rate)}</td><td>${e.is_voided?brl(0):brl(e.total_value)}</td><td>${esc(state)}${e.adjustment_reason?`<br><small>Motivo: ${esc(e.adjustment_reason)}</small>`:''}</td><td>${lock?`<span class="meta">${esc(lock)}</span>`:`<button class="sec" data-edit-piece="${e.id}">Editar</button>`}</td></tr>`;
      }).join('')||'<tr><td colspan="8">Nenhum lançamento.</td></tr>'}</table></div>`;
      host.querySelectorAll('[data-edit-piece]').forEach(btn=>{
        const entry=entries.find(e=>e.id===btn.dataset.editPiece);
        btn.onclick=()=>openPieceEditor(entry,contract);
      });
    }
  }catch(e){host.innerHTML=`<p class="meta">${esc(e?.message||String(e))}</p>`;}
}

async function patchCompanyContracts(){
  if(!isCompanyContracts()||running) return;
  if(document.querySelector('#entryAdjustmentManager')) return;
  running=true;
  try{
    const cid=await getCompanyId();
    const {data:contracts,error}=await sb.from('mei_contracts').select('id,code,service,model,status').eq('company_id',cid).order('created_at',{ascending:false});
    if(error) throw error;
    const card=document.createElement('div');
    card.className='card';
    card.id='entryAdjustmentManager';
    card.innerHTML=`<h2>Correção de lançamentos</h2><p class="meta">Ajustes exigem motivo e ficam registrados na auditoria. Lançamentos após envio da NF ficam bloqueados.</p><div class="field"><label>Contrato</label><select id="entryAdjustmentContract">${(contracts||[]).map(c=>`<option value="${c.id}">${esc(c.code)} — ${esc(c.service)} — ${c.model==='hour'?'Hora':'Peça'}</option>`).join('')}</select></div><div id="entryAdjustmentRows"></div>`;
    document.querySelector('main.wrap')?.append(card);
    const select=card.querySelector('#entryAdjustmentContract');
    select.onchange=()=>{closeEditor();renderSelectedContract(select.value,true);};
    if(select.value) await renderSelectedContract(select.value,true);
  }catch(e){console.error('Falha ao preparar correções de lançamentos:',e);}
  finally{running=false;}
}

async function patchMeiHistory(){
  if(!isMeiHistory()||running) return;
  const historyCard=[...document.querySelectorAll('.card h2')].find(h=>h.textContent?.trim()==='Histórico')?.closest('.card');
  if(!historyCard||historyCard.dataset.adjustmentsPatched==='1') return;
  running=true;
  try{
    const {data:{user},error:uErr}=await sb.auth.getUser();
    if(uErr||!user) throw new Error('Sessão inválida.');
    const [{data:h,error:hErr},{data:p,error:pErr}]=await Promise.all([
      sb.from('mei_hour_entries').select('*').eq('mei_id',user.id).order('started_at',{ascending:false}),
      sb.from('mei_piece_entries').select('*').eq('mei_id',user.id).order('produced_at',{ascending:false})
    ]);
    if(hErr) throw hErr;if(pErr) throw pErr;
    const rows=[
      ...(h||[]).map(x=>({d:x.started_at,type:'Hora',record:`${fmtDateTime(x.started_at)} → ${fmtDateTime(x.ended_at)}`,qty:x.minutes_worked?`${(x.minutes_worked/60).toFixed(2)} h`:'Em andamento',value:x.is_voided?0:x.total_value,closure:x.closure_id,voided:x.is_voided,reason:x.adjustment_reason,adjusted:x.adjusted_at})),
      ...(p||[]).map(x=>({d:x.produced_at,type:'Peça',record:`${x.piece_name} • lote ${x.lot_number}`,qty:x.quantity,value:x.is_voided?0:x.total_value,closure:x.closure_id,voided:x.is_voided,reason:x.adjustment_reason,adjusted:x.adjusted_at}))
    ].sort((a,b)=>new Date(b.d)-new Date(a.d));
    historyCard.innerHTML=`<h2>Histórico</h2><div class="table"><table><tr><th>Data</th><th>Modelo</th><th>Registro</th><th>Qtd/Horas</th><th>Valor</th><th>Fechamento</th><th>Ajuste da Empresa</th></tr>${rows.map(x=>`<tr><td>${fmtDateTime(x.d)}</td><td>${x.type}</td><td>${esc(x.record)}</td><td>${esc(x.qty)}</td><td>${brl(x.value)}</td><td>${x.closure?'<span class="badge b-ok">Fechado</span>':'<span class="badge b-warn">Aberto</span>'}</td><td>${x.adjusted?`<span class="badge b-warn">${x.voided?'Cancelado':'Ajustado'}</span><br><small>${fmtDateTime(x.adjusted)} • Motivo: ${esc(x.reason||'—')}</small>`:'—'}</td></tr>`).join('')||'<tr><td colspan="7">Nenhum lançamento.</td></tr>'}</table></div>`;
    historyCard.dataset.adjustmentsPatched='1';
  }catch(e){console.error('Falha ao exibir ajustes no histórico do MEI:',e);}
  finally{running=false;}
}

async function patchMeiHomeValue(){
  if(!isMeiHome()||running) return;
  const kpis=document.querySelectorAll('.card.kpi strong');
  if(!kpis.length||document.querySelector('main.wrap')?.dataset.adjustedToday==='1') return;
  running=true;
  try{
    const {data:{user},error:uErr}=await sb.auth.getUser();
    if(uErr||!user) throw new Error('Sessão inválida.');
    const [{data:h,error:hErr},{data:p,error:pErr}]=await Promise.all([
      sb.from('mei_hour_entries').select('ended_at,total_value,is_voided').eq('mei_id',user.id),
      sb.from('mei_piece_entries').select('produced_at,total_value,is_voided').eq('mei_id',user.id)
    ]);
    if(hErr) throw hErr;if(pErr) throw pErr;
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
    const totalH=(h||[]).filter(x=>!x.is_voided&&x.ended_at&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(x.ended_at))===day).reduce((s,x)=>s+Number(x.total_value||0),0);
    const totalP=(p||[]).filter(x=>!x.is_voided&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(x.produced_at))===day).reduce((s,x)=>s+Number(x.total_value||0),0);
    kpis[0].textContent=brl(totalH+totalP);
    document.querySelector('main.wrap').dataset.adjustedToday='1';
  }catch(e){console.error('Falha ao recalcular valor de hoje:',e);}
  finally{running=false;}
}

function apply(){patchCompanyContracts();patchMeiHistory();patchMeiHomeValue();}
if(appRoot){
  let scheduled=false;
  const observer=new MutationObserver(()=>{
    if(scheduled) return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply();});
  });
  observer.observe(appRoot,{subtree:true,childList:true});
}
apply();
