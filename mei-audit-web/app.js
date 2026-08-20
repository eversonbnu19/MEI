import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const app = document.querySelector('#app');
const SITE_URL = 'https://eversonbnu19.github.io/MEI/';
const brl = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0));
const fmt = x => x ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(x)) : '—';
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
let profile = null, sessionId = null, tab = 'inicio';

function toast(t){
  const d=document.createElement('div');
  d.className='toast'; d.textContent=t; document.body.append(d);
  setTimeout(()=>d.remove(),3200);
}
async function q(table,opts={}){
  let x=sb.from(table).select(opts.select||'*');
  if(opts.eq) for(const[k,v] of Object.entries(opts.eq)) x=x.eq(k,v);
  if(opts.order) x=x.order(opts.order,{ascending:false});
  const {data,error}=await x; if(error) throw error; return data;
}
async function audit(type,entity,id,details={}){ await sb.rpc('mei_audit',{event_type:type,entity_type:entity,entity_id:String(id||''),details}); }
async function loadProfile(){
  const {data:{user}}=await sb.auth.getUser(); if(!user) return null;
  const {data,error}=await sb.from('mei_profiles').select('*').eq('id',user.id).single();
  if(error) throw error; profile=data; return data;
}
function shell(content,tabs=[]){
  const roleLabel=profile.role==='mei'?'Execução mobile':profile.role==='company'?'Gestão da empresa':'Auditoria da empresa';
  app.innerHTML=`<header class="top"><div><b>MEI Contratos Auditáveis</b><small>${roleLabel}</small></div><div><small>${esc(profile.name||profile.email)}</small><button id="logout" class="sec">Sair</button></div></header><main class="wrap ${profile.role==='mei'?'mei-mobile':''}">${tabs.length?`<nav class="tabs">${tabs.map(x=>`<button data-tab="${x[0]}" class="${tab===x[0]?'active':''}">${x[1]}</button>`).join('')}</nav>`:''}${content}</main>`;
  document.querySelector('#logout').onclick=logout;
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
}

async function loginView(){
  app.innerHTML=`<div class="login"><div class="card"><h1>MEI Contratos Auditáveis</h1><p class="meta">Primeiro acesso: cadastre a empresa. Depois, dentro do painel da empresa, convide os MEIs e a Auditoria.</p><div class="field"><label>E-mail</label><input id="email" type="email" autocomplete="email"></div><div class="field"><label>Senha</label><input id="pass" type="password" autocomplete="current-password"></div><button class="pri full" id="login">Entrar</button><hr style="border:0;border-top:1px solid #e4e7ec;margin:20px 0"><h3>Cadastrar empresa</h3><div class="field"><label>Nome do responsável</label><input id="name"></div><div class="field"><label>Razão social / Nome da empresa</label><input id="companyName"></div><div class="field"><label>CNPJ da empresa</label><input id="cnpj"></div><button class="sec full" id="signup">Criar empresa com e-mail e senha acima</button><p class="meta">O primeiro cadastro cria o perfil <b>Empresa</b>. MEIs e Auditoria não se cadastram livremente: recebem convite por e-mail da empresa.</p></div></div>`;
  document.querySelector('#login').onclick=async()=>{
    try{
      const {error}=await sb.auth.signInWithPassword({email:email.value,password:pass.value});
      if(error) throw error; await afterLogin();
    }catch(e){toast(e.message)}
  };
  document.querySelector('#signup').onclick=async()=>{
    try{
      if(!email.value||!pass.value||!companyName.value) throw new Error('Preencha e-mail, senha e nome da empresa.');
      const {error}=await sb.auth.signUp({
        email:email.value.trim(), password:pass.value,
        options:{emailRedirectTo:SITE_URL,data:{name:name.value.trim(),company_name:companyName.value.trim(),cnpj:cnpj.value.trim()}}
      });
      if(error) throw error;
      toast('Empresa cadastrada. Verifique o e-mail para confirmar o acesso.');
    }catch(e){toast(e.message)}
  };
}

async function afterLogin(){
  await loadProfile();
  const d={user_agent:navigator.userAgent,platform:navigator.platform||'',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  const {data}=await sb.from('mei_access_sessions').insert({user_id:profile.id,...d}).select().single();
  sessionId=data?.id||null; await audit('login','access_session',sessionId,d); tab='inicio'; render();
}
async function logout(){
  try{ if(sessionId){await sb.from('mei_access_sessions').update({logged_out_at:new Date().toISOString()}).eq('id',sessionId); await audit('logout','access_session',sessionId);} }
  finally{await sb.auth.signOut(); profile=null; sessionId=null; loginView();}
}
async function render(){
  try{
    if(profile.role==='mei') await renderMei();
    else if(profile.role==='company') await renderCompany();
    else if(profile.role==='auditor') await renderAudit();
    else throw new Error('Perfil sem permissão válida.');
  }catch(e){console.error(e);toast(e.message)}
}

async function renderMei(){
  const tabs=[['inicio','Registrar'],['historico','Histórico'],['fechamentos','Fechamentos / NF']];
  if(tab==='historico') return meiHistory(tabs);
  if(tab==='fechamentos') return meiClosures(tabs);
  const contracts=await q('mei_contracts',{eq:{mei_id:profile.id}});
  const hrs=await q('mei_hour_entries',{eq:{mei_id:profile.id}});
  const pcs=await q('mei_piece_entries',{eq:{mei_id:profile.id}});
  const dayH=hrs.filter(x=>x.ended_at&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(x.ended_at))===today()).reduce((s,x)=>s+Number(x.total_value||0),0);
  const dayP=pcs.filter(x=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(x.produced_at))===today()).reduce((s,x)=>s+Number(x.total_value||0),0);
  let cards=`<div class="grid"><div class="card kpi"><small>Valor hoje</small><strong>${brl(dayH+dayP)}</strong></div><div class="card kpi"><small>Contratos ativos</small><strong>${contracts.filter(c=>c.status==='active').length}</strong></div></div>`;
  for(const c of contracts.filter(c=>c.status==='active')){
    if(c.model==='hour'){
      const running=hrs.find(x=>x.contract_id===c.id&&!x.ended_at);
      cards+=`<section class="hero-action"><span class="badge b-blue">Por hora</span><h2>${esc(c.code)}</h2><p class="meta">${esc(c.service)} • ${brl(c.hour_rate)}/h</p>${running?`<div class="clock">Em andamento</div><p>Entrada oficial: <b>${fmt(running.started_at)}</b></p><button class="danger bigbtn" data-end="${running.id}">Registrar saída</button>`:`<button class="pri bigbtn" data-start="${c.id}">Registrar entrada</button>`}</section>`;
    }else{
      const rates=await q('mei_piece_rates',{eq:{contract_id:c.id}});
      cards+=`<section class="hero-action"><span class="badge b-blue">Por peça</span><h2>${esc(c.code)}</h2><p class="meta">${esc(c.service)}</p><div class="field"><label>Tipo de peça</label><select id="piece_${c.id}">${rates.filter(r=>r.active).map(r=>`<option value="${r.id}">${esc(r.piece_name)} — ${brl(r.unit_rate)}</option>`).join('')}</select></div><div class="two"><div class="field"><label>Número do lote</label><input id="lot_${c.id}" placeholder="Obrigatório"></div><div class="field"><label>Quantidade</label><input id="qty_${c.id}" type="number" step="0.001" min="0"></div></div><button class="pri bigbtn" data-piece="${c.id}">Registrar produção</button></section>`;
    }
  }
  shell(cards,tabs);
  document.querySelectorAll('[data-start]').forEach(b=>b.onclick=async()=>{try{const{error}=await sb.rpc('mei_start_hour',{p_contract:b.dataset.start,p_session:sessionId});if(error)throw error;toast('Entrada registrada pelo servidor');render()}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-end]').forEach(b=>b.onclick=async()=>{try{const{error}=await sb.rpc('mei_end_hour',{p_entry:b.dataset.end,p_session:sessionId});if(error)throw error;toast('Saída registrada');render()}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-piece]').forEach(b=>b.onclick=async()=>{const id=b.dataset.piece;try{const{error}=await sb.rpc('mei_add_piece',{p_contract:id,p_piece_rate:document.querySelector(`#piece_${id}`).value,p_lot:document.querySelector(`#lot_${id}`).value,p_quantity:Number(document.querySelector(`#qty_${id}`).value),p_session:sessionId});if(error)throw error;toast('Produção registrada');render()}catch(e){toast(e.message)}});
}
async function meiHistory(tabs){
  const h=await q('mei_hour_entries',{eq:{mei_id:profile.id},order:'started_at'}), p=await q('mei_piece_entries',{eq:{mei_id:profile.id},order:'produced_at'});
  const rows=[...h.map(x=>({d:x.started_at,t:'Hora',r:`${fmt(x.started_at)} → ${fmt(x.ended_at)}`,q:x.minutes_worked?`${(x.minutes_worked/60).toFixed(2)} h`:'Em andamento',v:x.total_value,c:x.closure_id})),...p.map(x=>({d:x.produced_at,t:'Peça',r:`${x.piece_name} • lote ${x.lot_number}`,q:x.quantity,v:x.total_value,c:x.closure_id}))].sort((a,b)=>new Date(b.d)-new Date(a.d));
  shell(`<div class="card"><h2>Histórico</h2><div class="table"><table><tr><th>Data</th><th>Modelo</th><th>Registro</th><th>Qtd/Horas</th><th>Valor</th><th>Fechamento</th></tr>${rows.map(x=>`<tr><td>${fmt(x.d)}</td><td>${x.t}</td><td>${esc(x.r)}</td><td>${x.q}</td><td>${brl(x.v)}</td><td>${x.c?'<span class="badge b-ok">Fechado</span>':'<span class="badge b-warn">Aberto</span>'}</td></tr>`).join('')}</table></div></div>`,tabs);
}
async function meiClosures(tabs){
  const cls=await q('mei_closures',{eq:{mei_id:profile.id},order:'closed_at'}), invs=await q('mei_invoices');
  const html=`<div class="card"><h2>Fechamentos e notas fiscais</h2>${cls.map(c=>{const i=invs.find(x=>x.closure_id===c.id);return `<section class="card"><b>${c.period_start} a ${c.period_end}</b><div>${brl(c.total_value)} • <span class="badge">${c.status}</span></div><p class="meta">Fechado em ${fmt(c.closed_at)}</p>${i?`<p>NF ${esc(i.invoice_number)} • enviada ${fmt(i.uploaded_at)}</p>`:`<div class="two"><div class="field"><label>Número NF</label><input id="n_${c.id}"></div><div class="field"><label>Data emissão</label><input id="d_${c.id}" type="date" value="${today()}"></div></div><div class="field"><label>Arquivo PDF/JPG/PNG</label><input id="f_${c.id}" type="file" accept="application/pdf,image/jpeg,image/png"></div><button class="pri" data-invoice="${c.id}">Enviar nota fiscal</button>`}</section>`}).join('')||'<p class="meta">Nenhum fechamento.</p>'}</div>`;
  shell(html,tabs);
  document.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=async()=>{const id=b.dataset.invoice,f=document.querySelector(`#f_${id}`).files[0];if(!f)return toast('Selecione o arquivo');try{const path=`${profile.id}/${id}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;let{error}=await sb.storage.from('mei-invoices').upload(path,f);if(error)throw error;const r=await sb.rpc('mei_register_invoice',{p_closure:id,p_number:document.querySelector(`#n_${id}`).value,p_issue_date:document.querySelector(`#d_${id}`).value,p_path:path,p_file_name:f.name,p_mime:f.type,p_size:f.size});if(r.error)throw r.error;toast('NF enviada para a empresa');render()}catch(e){toast(e.message)}});
}

async function companyBase(){
  const cu=await q('mei_company_users',{eq:{user_id:profile.id}});
  if(!cu.length) throw new Error('Usuário empresa ainda não está vinculado a uma empresa.');
  return cu[0].company_id;
}
async function renderCompany(){
  const tabs=[['inicio','Painel'],['usuarios','Usuários'],['contratos','Contratos'],['fechamentos','Fechamentos / NFs']];
  const cid=await companyBase();
  if(tab==='usuarios') return companyUsers(tabs,cid);
  if(tab==='contratos') return companyContracts(tabs,cid);
  if(tab==='fechamentos') return companyClosures(tabs,cid);
  const cs=await q('mei_contracts',{eq:{company_id:cid}}), cl=await q('mei_closures',{eq:{company_id:cid}});
  const people=await sb.rpc('mei_company_people',{p_company:cid});
  shell(`<div class="grid"><div class="card kpi"><small>Usuários vinculados</small><strong>${people.data?.length||0}</strong></div><div class="card kpi"><small>Contratos</small><strong>${cs.length}</strong></div><div class="card kpi"><small>Aguardando NF</small><strong>${cl.filter(x=>x.status==='awaiting_invoice').length}</strong></div><div class="card kpi"><small>Total fechado</small><strong>${brl(cl.reduce((s,x)=>s+Number(x.total_value),0))}</strong></div></div><div class="card"><h2>Fluxo seguro de cadastro</h2><p>1. A empresa é o cadastro principal.</p><p>2. A empresa envia convites por e-mail para MEIs e Auditoria.</p><p>3. Cada convidado aceita o convite e passa a enxergar somente os dados desta empresa.</p></div>`,tabs);
}
async function companyUsers(tabs,cid){
  const r=await sb.rpc('mei_company_people',{p_company:cid}); if(r.error) throw r.error;
  const people=r.data||[];
  const rows=people.map(p=>`<tr><td>${esc(p.name||'—')}</td><td>${esc(p.email)}</td><td>${p.role==='mei'?'MEI':'Auditoria'}</td><td>${p.status==='active'?'<span class="badge b-ok">Ativo</span>':'<span class="badge b-warn">Convite enviado</span>'}</td></tr>`).join('');
  shell(`<div class="card"><h2>Convidar usuário</h2><p class="meta">O usuário receberá um e-mail do sistema com um link seguro para criar/ativar o acesso.</p><div class="two"><div class="field"><label>Tipo</label><select id="inviteRole"><option value="mei">MEI</option><option value="auditor">Auditoria</option></select></div><div class="field"><label>Nome</label><input id="inviteName"></div></div><div class="field"><label>E-mail</label><input id="inviteEmail" type="email"></div><div class="field"><label>CNPJ do MEI (quando aplicável)</label><input id="inviteCnpj"></div><button class="pri" id="sendInvite">Enviar convite por e-mail</button></div><div class="card"><h2>Usuários e convites</h2><div class="table"><table><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th></tr>${rows||'<tr><td colspan="4">Nenhum usuário convidado.</td></tr>'}</table></div></div>`,tabs);
  document.querySelector('#sendInvite').onclick=async()=>{
    try{
      const email=document.querySelector('#inviteEmail').value.trim();
      const role=document.querySelector('#inviteRole').value;
      const name=document.querySelector('#inviteName').value.trim();
      const cnpj=document.querySelector('#inviteCnpj').value.trim();
      if(!email||!name) throw new Error('Informe nome e e-mail.');
      const {data,error}=await sb.functions.invoke('mei-invite-user',{body:{company_id:cid,email,role,name,cnpj,redirect_to:SITE_URL}});
      if(error) throw error; if(!data?.ok) throw new Error(data?.error||'Falha ao enviar convite');
      await audit('user_invited','company',cid,{email,role});
      toast('Convite enviado por e-mail.'); render();
    }catch(e){toast(e.message)}
  };
}
async function companyContracts(tabs,cid){
  const cs=await q('mei_contracts',{eq:{company_id:cid}});
  const ppl=await sb.rpc('mei_company_people',{p_company:cid});
  const meis=(ppl.data||[]).filter(p=>p.role==='mei'&&p.status==='active');
  const html=`<div class="card"><h2>Novo contrato</h2>${meis.length?`<div class="field"><label>MEI</label><select id="meiId">${meis.map(m=>`<option value="${m.user_id}">${esc(m.name)} — ${esc(m.email)}</option>`).join('')}</select></div>`:'<p class="meta">Convide e ative pelo menos um MEI na aba Usuários antes de criar contratos.</p>'}<div class="two"><div class="field"><label>Código</label><input id="code"></div><div class="field"><label>Modelo</label><select id="model"><option value="hour">Por hora</option><option value="piece">Por peça</option></select></div></div><div class="field"><label>Serviço</label><input id="service"></div><div class="two"><div class="field"><label>Início</label><input id="start" type="date" value="${today()}"></div><div class="field"><label>Fim</label><input id="end" type="date"></div></div><div class="field"><label>Valor/hora (se por hora)</label><input id="rate" type="number" step="0.01"></div><button class="pri" id="createContract" ${meis.length?'':'disabled'}>Criar contrato</button></div><div class="card"><h2>Contratos</h2><div class="table"><table><tr><th>Código</th><th>Modelo</th><th>Serviço</th><th>Valor/h</th><th>Ação</th></tr>${cs.map(c=>`<tr><td>${esc(c.code)}</td><td>${c.model}</td><td>${esc(c.service)}</td><td>${brl(c.hour_rate)}</td><td>${c.model==='piece'?`<button class="sec" data-rate="${c.id}">Adicionar peça</button>`:''}</td></tr>`).join('')}</table></div></div>`;
  shell(html,tabs);
  const create=document.querySelector('#createContract');
  if(create) create.onclick=async()=>{try{const meiId=document.querySelector('#meiId').value;const{error}=await sb.from('mei_contracts').insert({company_id:cid,mei_id:meiId,code:code.value,model:model.value,service:service.value,start_date:start.value,end_date:end.value||null,hour_rate:Number(rate.value||0),created_by:profile.id});if(error)throw error;await audit('contract_created','contract',code.value,{model:model.value});toast('Contrato criado');render()}catch(e){toast(e.message)}};
  document.querySelectorAll('[data-rate]').forEach(b=>b.onclick=async()=>{const name=prompt('Nome da peça');if(!name)return;const rate=Number(prompt('Valor unitário')||0);const{error}=await sb.from('mei_piece_rates').insert({contract_id:b.dataset.rate,piece_name:name,unit_rate:rate});if(error)toast(error.message);else{toast('Peça adicionada');render();}});
}
async function companyClosures(tabs,cid){
  const cs=await q('mei_contracts',{eq:{company_id:cid}}), cls=await q('mei_closures',{eq:{company_id:cid},order:'closed_at'}), invs=await q('mei_invoices');
  let html=`<div class="card"><h2>Fechar período</h2><div class="field"><label>Contrato</label><select id="closeContract">${cs.map(c=>`<option value="${c.id}">${esc(c.code)} — ${esc(c.service)}</option>`).join('')}</select></div><div class="two"><div class="field"><label>Início</label><input id="closeStart" type="date"></div><div class="field"><label>Fim</label><input id="closeEnd" type="date"></div></div><button class="pri" id="closeBtn">Fechar período</button></div><div class="card"><h2>Fechamentos</h2>${cls.map(c=>{const i=invs.find(x=>x.closure_id===c.id);return `<section class="card"><b>${c.period_start} a ${c.period_end}</b><p>${brl(c.total_value)} • ${c.status}</p>${i?`<p>NF ${esc(i.invoice_number)} <button class="sec" data-download="${i.id}" data-path="${esc(i.storage_path)}" data-closure="${c.id}">Baixar NF</button></p>`:'<p class="meta">Aguardando NF do MEI.</p>'}${['invoice_sent','invoice_received'].includes(c.status)?`<button class="pri" data-pay="${c.id}">Encaminhar p/ pagamento</button>`:''}</section>`}).join('')||'<p class="meta">Nenhum fechamento.</p>'}</div>`;
  shell(html,tabs);
  document.querySelector('#closeBtn').onclick=async()=>{try{const{error}=await sb.rpc('mei_close_period',{p_contract:closeContract.value,p_start:closeStart.value,p_end:closeEnd.value});if(error)throw error;toast('Período fechado');render()}catch(e){toast(e.message)}};
  document.querySelectorAll('[data-download]').forEach(b=>b.onclick=async()=>{try{const{data,error}=await sb.storage.from('mei-invoices').createSignedUrl(b.dataset.path,60);if(error)throw error;window.open(data.signedUrl,'_blank');await sb.rpc('mei_mark_invoice_received',{p_closure:b.dataset.closure});render()}catch(e){toast(e.message)}});
  document.querySelectorAll('[data-pay]').forEach(b=>b.onclick=async()=>{try{const{error}=await sb.rpc('mei_send_to_payment',{p_closure:b.dataset.pay});if(error)throw error;toast('Encaminhado para pagamento');render()}catch(e){toast(e.message)}});
}

async function auditorCompany(){
  const a=await q('mei_company_auditors',{eq:{user_id:profile.id}});
  if(!a.length) throw new Error('Auditor ainda não está vinculado a uma empresa.');
  return a[0].company_id;
}
async function renderAudit(){
  const tabs=[['inicio','Visão geral'],['execucoes','Execuções'],['acessos','Acessos'],['fechamentos','Fechamentos']];
  const cid=await auditorCompany();
  if(tab==='execucoes') return auditExecutions(tabs,cid);
  if(tab==='acessos') return auditAccess(tabs,cid);
  if(tab==='fechamentos') return auditClosures(tabs,cid);
  const cs=await q('mei_contracts',{eq:{company_id:cid}}), cl=await q('mei_closures',{eq:{company_id:cid}});
  const ppl=await sb.rpc('mei_company_people',{p_company:cid});
  shell(`<div class="grid"><div class="card kpi"><small>MEIs</small><strong>${(ppl.data||[]).filter(x=>x.role==='mei'&&x.status==='active').length}</strong></div><div class="card kpi"><small>Contratos</small><strong>${cs.length}</strong></div><div class="card kpi"><small>Fechamentos</small><strong>${cl.length}</strong></div></div><div class="card"><h2>Escopo da auditoria</h2><p class="meta">Este perfil enxerga somente registros da empresa que enviou o convite.</p></div>`,tabs);
}
async function auditExecutions(tabs,cid){
  const cs=await q('mei_contracts',{eq:{company_id:cid}}), ids=cs.map(c=>c.id);
  let h=[],p=[];
  if(ids.length){const rh=await sb.from('mei_hour_entries').select('*').in('contract_id',ids).order('started_at',{ascending:false});if(rh.error)throw rh.error;h=rh.data||[];const rp=await sb.from('mei_piece_entries').select('*').in('contract_id',ids).order('produced_at',{ascending:false});if(rp.error)throw rp.error;p=rp.data||[];}
  shell(`<div class="card"><h2>Execuções por hora</h2><div class="table"><table><tr><th>Entrada</th><th>Saída</th><th>Minutos</th><th>Valor</th></tr>${h.map(x=>`<tr><td>${fmt(x.started_at)}</td><td>${fmt(x.ended_at)}</td><td>${x.minutes_worked??'—'}</td><td>${brl(x.total_value)}</td></tr>`).join('')}</table></div></div><div class="card"><h2>Execuções por peça</h2><div class="table"><table><tr><th>Data</th><th>Peça</th><th>Lote</th><th>Qtd</th><th>Valor</th></tr>${p.map(x=>`<tr><td>${fmt(x.produced_at)}</td><td>${esc(x.piece_name)}</td><td>${esc(x.lot_number)}</td><td>${x.quantity}</td><td>${brl(x.total_value)}</td></tr>`).join('')}</table></div></div>`,tabs);
}
async function auditAccess(tabs,cid){
  const ppl=await sb.rpc('mei_company_people',{p_company:cid}), ids=(ppl.data||[]).filter(x=>x.user_id).map(x=>x.user_id);
  let a=[];if(ids.length){const r=await sb.from('mei_access_sessions').select('*').in('user_id',ids).order('logged_in_at',{ascending:false});if(r.error)throw r.error;a=r.data||[];}
  shell(`<div class="card"><h2>Acessos</h2><div class="table"><table><tr><th>Usuário</th><th>Entrada</th><th>Saída</th><th>Fuso</th><th>Navegador</th></tr>${a.map(x=>`<tr><td>${x.user_id.slice(0,8)}</td><td>${fmt(x.logged_in_at)}</td><td>${fmt(x.logged_out_at)}</td><td>${esc(x.timezone)}</td><td>${esc(x.user_agent)}</td></tr>`).join('')}</table></div></div>`,tabs);
}
async function auditClosures(tabs,cid){
  const cls=await q('mei_closures',{eq:{company_id:cid},order:'closed_at'}), invs=await q('mei_invoices');
  shell(`<div class="card"><h2>Fechamentos</h2><div class="table"><table><tr><th>Período</th><th>Modelo</th><th>Valor</th><th>Status</th><th>NF</th></tr>${cls.map(c=>{const i=invs.find(x=>x.closure_id===c.id);return `<tr><td>${c.period_start} a ${c.period_end}</td><td>${c.model}</td><td>${brl(c.total_value)}</td><td>${c.status}</td><td>${i?esc(i.invoice_number):'—'}</td></tr>`}).join('')}</table></div></div>`,tabs);
}

const {data:{session}}=await sb.auth.getSession();
if(session){try{await afterLogin()}catch(e){console.error(e);await sb.auth.signOut();loginView();toast(e.message)}}else loginView();
