// v32: a notificação é deliberadamente assíncrona: um problema de e-mail nunca reverte o fechamento/NF.
const sb=window.__GESTAO_SB__;
const EVENTS={mei_close_period:'closure_created',mei_register_invoice:'invoice_sent',mei_send_to_payment:'sent_to_payment',mei_mark_erp_posted:'erp_posted'};

function notify(event,closureId){
  if(!closureId) return;
  return sb.functions.invoke('mei-send-notification',{body:{action:'dispatch',event,closure_id:closureId}})
    .then(({error})=>{if(error)console.warn('Notificação registrada como falha:',error.message);})
    .catch(error=>console.warn('Notificação indisponível:',error.message));
}
window.__GESTAO_NOTIFY__=notify;

const originalRpc=sb.rpc.bind(sb);
sb.rpc=async(name,args,...rest)=>{
  const result=await originalRpc(name,args,...rest);
  if(!result.error&&name==='mei_close_period'){
    // A RPC de fechamento não retorna o id em todas as versões do banco; busca-se o fechamento recém-criado em segundo plano.
    sb.from('mei_closures').select('id').eq('contract_id',args?.p_contract).eq('period_start',args?.p_start).eq('period_end',args?.p_end).order('closed_at',{ascending:false}).limit(1).maybeSingle()
      .then(({data})=>notify('closure_created',data?.id)).catch(error=>console.warn('Fechamento concluído; notificação pendente:',error.message));
  }else if(!result.error&&EVENTS[name]) notify(EVENTS[name],args?.p_closure||null);
  return result;
};

async function addRetryControls(){
  const active=document.querySelector('.tabs [data-tab="fechamentos"].active');
  if(!active||document.querySelector('[data-notification-retry]')) return;
  const {data,error}=await sb.functions.invoke('mei-send-notification',{body:{action:'list'}});
  if(error||!data?.notifications?.length) return;
  const failed=data.notifications.filter(n=>n.status==='failed');
  if(!failed.length) return;
  const host=[...document.querySelectorAll('.card h2')].find(h=>h.textContent.trim()==='Fechamentos')?.closest('.card');
  if(!host) return;
  const items=failed.map(n=>`<li>${String(n.recipient_role||'Destinatário')} — ${String(n.email||'')} (${String(n.event||'')}) <button class="sec" data-notification-retry="${String(n.id)}">Reenviar</button></li>`).join('');
  host.insertAdjacentHTML('beforeend',`<section class="card"><h3>Comunicações pendentes</h3><p class="meta">O processo foi concluído; os e-mails abaixo podem ser reenviados.</p><ul>${items}</ul></section>`);
  document.querySelectorAll('[data-notification-retry]').forEach(button=>button.onclick=async()=>{
    button.disabled=true;
    const {error}=await sb.functions.invoke('mei-send-notification',{body:{action:'retry',notification_id:button.dataset.notificationRetry}});
    if(error){button.disabled=false;return alert(error.message||'Não foi possível reenviar.');}
    location.reload();
  });
}

new MutationObserver(()=>{addRetryControls().catch(error=>console.warn('Histórico de comunicações indisponível:',error.message));}).observe(document.documentElement,{childList:true,subtree:true});
