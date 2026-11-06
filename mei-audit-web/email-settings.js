import {CATALOG,FIELDS,EXAMPLE,escapeHtml as esc,warnings,validateTemplate,renderTemplate} from './email-core.mjs?v=38';
const roles={company:'Empresa',mei:'MEI',auditor:'Auditoria'};
export async function mountEmailSettings({sb,cid,shell,tabs}){
 const {data:owner,error:ownerError}=await sb.from('mei_email_owners').select('user_id').eq('company_id',cid).maybeSingle();
 const {data:{user}}=await sb.auth.getUser();
 if(ownerError) throw ownerError;
 if(!user||owner?.user_id!==user.id) throw new Error('Configurações disponíveis somente para a Empresa principal.');
 const {data:custom,error}=await sb.from('mei_email_templates').select('*').eq('company_id',cid);
 if(error) throw error;
 shell('<section class="card"><h1>Configurações</h1><h2>E-mails automáticos</h2><p>Edite o assunto e a mensagem de cada evento. O texto livre é escrito por você. Os campos <mark>{{campo}}</mark> serão preenchidos pelo sistema no envio.</p><p class="meta">Use os botões para formatar: **negrito**, # título e - lista. A prévia mostra o resultado com dados fictícios. O teste usa o conteúdo em edição e será enviado apenas ao seu e-mail de acesso.</p><p id="emailAccount"></p></section><div id="emailModels"></div><section class="card"><h2>Histórico de alterações</h2><div id="emailAudit"></div><button class="sec" id="emailMoreAudit">Carregar mais</button></section>',tabs);
 document.querySelector('#emailAccount').textContent='E-mail para testes: '+user.email;
 const host=document.querySelector('#emailModels');
 for(const model of CATALOG){
  const saved=custom?.find(x=>x.event===model.event&&x.recipient_role===model.recipient_role);
  let revision=saved?.revision||0, target=null;
  const card=document.createElement('section');card.className='card email-model';
  card.innerHTML='<h2>'+esc(model.label)+'</h2><p class="meta">Destinatário: '+roles[model.recipient_role]+(model.event==='invoice_received'?' • Modelo de reenvio do histórico':'')+'</p>'+
   '<div class="field"><label>Assunto<input class="email-subject" maxlength="500"></label></div>'+
   '<div class="field"><label>Mensagem<textarea class="email-body" rows="9" maxlength="30000" spellcheck="true"></textarea></label></div>'+
   '<div class="email-toolbar" role="group" aria-label="Formatação da mensagem"><button type="button" data-format="bold" class="sec"><b>Negrito</b></button><button type="button" data-format="heading" class="sec">Título</button><button type="button" data-format="list" class="sec">Lista</button><button type="button" data-format="number" class="sec">Lista numerada</button><button type="button" data-format="break" class="sec">Quebra de linha</button></div>'+
   '<h3>Campos do sistema</h3><p class="meta">Clique para inserir no assunto ou na mensagem, na posição do cursor.</p><div class="email-fields">'+model.fields.map(k=>'<button type="button" class="sec" data-field="'+k+'" title="'+esc(FIELDS[k])+'">{{'+k+'}} <small>'+esc(FIELDS[k])+'</small></button>').join('')+'</div>'+
   '<p class="meta">Campos automáticos usados (destacados); o restante é texto livre:</p><div class="email-tokens"></div><div class="email-warnings" role="status"></div>'+
   '<div class="email-actions"><button class="sec" data-action="preview">Visualizar exemplo</button><button class="sec" data-action="test">Enviar e-mail de teste</button><button class="pri" data-action="save">Salvar</button><button class="sec" data-action="restore">Restaurar padrão</button></div>'+
   '<p class="email-status" role="status"></p><div class="email-preview" hidden><h3>Exemplo com dados fictícios</h3><p class="email-preview-subject"></p><iframe title="Prévia do e-mail com dados fictícios" sandbox=""></iframe></div>';
  host.append(card);
  const subject=card.querySelector('.email-subject'),body=card.querySelector('.email-body'),status=card.querySelector('.email-status');
  subject.value=saved?.subject??model.subject;body.value=saved?.body??model.body; target=body;
  let baseline={subject:subject.value,body:body.value};
  const markDirty=()=>{card.dataset.dirty=String(subject.value!==baseline.subject||body.value!==baseline.body);};
  const update=()=>{
   markDirty();
   const ws=warnings(model,subject.value,body.value);
   card.querySelector('.email-warnings').textContent=ws.length?ws.join(' • ')+' — Você pode salvar mesmo assim.':'';
   const tokens=[...new Set([...(subject.value+'\n'+body.value).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m=>m[1]))];
   card.querySelector('.email-tokens').innerHTML=tokens.map(k=>'<mark>{{'+esc(k)+'}}</mark>').join(' ')||'<span class="meta">Nenhum campo automático inserido.</span>';
  };
  for(const input of [subject,body]){input.addEventListener('focus',()=>target=input);input.addEventListener('input',()=>{card.querySelector('.email-preview').hidden=true;update();});}
  function insert(input,text,start=input.selectionStart,end=input.selectionEnd){input.setRangeText(text,start,end,'end');input.focus();input.dispatchEvent(new Event('input'));}
  card.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>insert(target,'{{'+b.dataset.field+'}}'));
  card.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{
   const a=body.selectionStart,z=body.selectionEnd,selected=body.value.slice(a,z);
   if(b.dataset.format==='bold')insert(body,'**'+(selected||'texto em negrito')+'**',a,z);
   else if(b.dataset.format==='break')insert(body,'\n',a,z);
   else{
    const start=body.value.lastIndexOf('\n',a-1)+1, prefix={heading:'# ',list:'- ',number:'1. '}[b.dataset.format];
    insert(body,body.value.slice(start,z).split('\n').map(line=>prefix+line).join('\n'),start,z);
   }
  });
  card.querySelectorAll('[data-action]').forEach(button=>button.onclick=async()=>{
   const action=button.dataset.action;
   try{
    if(action==='restore'&&!confirm('Restaurar e salvar a mensagem padrão deste modelo? O conteúdo atual será registrado no histórico.'))return;
    if(action!=='restore')validateTemplate(subject.value,body.value);
    if(action==='preview'){
     const rendered=renderTemplate({subject:subject.value,body:body.value},EXAMPLE);
     card.querySelector('.email-preview-subject').textContent=rendered.subject;
     card.querySelector('iframe').srcdoc='<!doctype html><meta charset="utf-8">'+rendered.html;
     card.querySelector('.email-preview').hidden=false;status.textContent='Prévia atualizada com dados fictícios.';return;
    }
    card.querySelectorAll('[data-action]').forEach(b=>b.disabled=true);
    status.textContent=action==='test'?'Enviando teste...':'Salvando...';
    if(action==='test'){
     const {data,error}=await sb.functions.invoke('mei-send-notification',{body:{action:'test_template',company_id:cid,event:model.event,recipient_role:model.recipient_role,subject:subject.value,body:body.value}});
     if(error){const detail=await error.context?.json?.().catch(()=>null);throw new Error(detail?.error||error.message);}
     if(!data?.ok)throw new Error(data?.error||'Não foi possível enviar o teste.');
     status.textContent='Teste enviado para '+data.email+'. O modelo em edição ainda precisa ser salvo.';return;
    }
    const draft={subject:subject.value,body:body.value};
    const {data,error}=await sb.rpc('mei_save_email_template',{p_company:cid,p_event:model.event,p_role:model.recipient_role,p_subject:draft.subject,p_body:draft.body,p_expected_revision:revision,p_restore:action==='restore'});
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    revision=result.revision;
    // Preserve any typing done while the save request was in flight.
    if(action==='restore'&&subject.value===draft.subject&&body.value===draft.body){subject.value=result.subject;body.value=result.body;}
    baseline={subject:result.subject,body:result.body};update();
    card.querySelector('.email-preview').hidden=true;
    status.textContent=(action==='restore'?'Padrão restaurado e salvo.':'Modelo salvo.')+' Revisão '+revision+'.';
    await loadAudit(true);
   }catch(e){status.textContent=e.message||String(e);}
   finally{card.querySelectorAll('[data-action]').forEach(b=>b.disabled=false);}
  });
  update();
 }
 let offset=0;
 async function loadAudit(reset=false){
  if(reset){offset=0;document.querySelector('#emailAudit').replaceChildren();}
  const {data,error}=await sb.from('mei_email_template_audit').select('*').eq('company_id',cid).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+49);
  if(error)throw error;
  const area=document.querySelector('#emailAudit');
  if(reset&&!data.length)area.textContent='Nenhuma alteração registrada.';
  for(const entry of data){
   const d=document.createElement('details');
   const m=CATALOG.find(x=>x.event===entry.event&&x.recipient_role===entry.recipient_role);
   d.innerHTML='<summary>'+esc(new Date(entry.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+' (Brasília) • '+esc(entry.actor_name||entry.actor_email)+' • '+esc(m?.label||entry.event)+' • '+(entry.action==='restore'?'Restaurou padrão':'Salvou')+'</summary><p>'+esc(entry.actor_email)+' • Usuário '+esc(entry.actor_id)+'</p><div class="two"><div><b>Anterior</b><pre>'+esc(entry.previous_content.subject)+'\n\n'+esc(entry.previous_content.body)+'</pre></div><div><b>Novo</b><pre>'+esc(entry.new_content.subject)+'\n\n'+esc(entry.new_content.body)+'</pre></div></div>';
   area.append(d);
  }
  offset+=data.length;document.querySelector('#emailMoreAudit').hidden=data.length<50;
 }
 document.querySelector('#emailMoreAudit').onclick=()=>loadAudit().catch(e=>alert(e.message));
 await loadAudit(true);
}
