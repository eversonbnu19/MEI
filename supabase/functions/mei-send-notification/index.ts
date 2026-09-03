import { createClient } from 'npm:@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const title:Record<string,Record<string,string>>={
  closure_created:{mei:'Fechamento realizado - emitir NFSe'},
  invoice_sent:{company:'NFSe enviada - aguardando autorização'},
  sent_to_payment:{auditor:'Pagamento autorizado - NFSe disponível'},
  // Mantido apenas para que reenvios do histórico v30 continuem possíveis.
  invoice_received:{auditor:'NFSe disponível para conferência'}
};
function escapeHtml(value:unknown){return String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function formatDate(value:string){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date(`${value}T12:00:00Z`));}

Deno.serve(async request=>{
  if(request.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(request.method!=='POST') return json({error:'Método não permitido'},405);
  const auth=request.headers.get('Authorization');
  if(!auth) return json({error:'Sessão obrigatória'},401);
  const url=Deno.env.get('SUPABASE_URL')!;
  const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
  const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user) return json({error:'Sessão inválida'},401);
  const body=await request.json().catch(()=>({}));
  const {data:profile}=await admin.from('mei_profiles').select('id,role,name,email').eq('id',user.id).single();
  if(!profile) return json({error:'Perfil não encontrado'},403);

  if(body.action==='list'){
    const [{data:meiClosures},{data:companyUsers},{data:audits}]=await Promise.all([
      admin.from('mei_closures').select('id').eq('mei_id',user.id),
      admin.from('mei_company_users').select('company_id').eq('user_id',user.id),
      admin.from('mei_company_auditors').select('company_id').eq('user_id',user.id)
    ]);
    const companyIds=[...(companyUsers||[]),...(audits||[])].map(x=>x.company_id);
    const allowed=new Set((meiClosures||[]).map(c=>c.id));
    if(companyIds.length){const {data:closures}=await admin.from('mei_closures').select('id').in('company_id',companyIds);(closures||[]).forEach(c=>allowed.add(c.id));}
    const {data:notifications}=allowed.size?await admin.from('mei_notifications').select('*').in('closure_id',[...allowed]).order('created_at',{ascending:false}).limit(100):{data:[]};
    return json({notifications:notifications||[]});
  }

  let event=body.event as string|undefined, closureId=body.closure_id as string|undefined;
  let retryNotification:{email:string,recipient_role:string}|null=null;
  if(body.action==='retry'){
    const {data:previous}=await admin.from('mei_notifications').select('*').eq('id',body.notification_id).single();
    if(!previous) return json({error:'Notificação não localizada'},404);
    event=previous.event; closureId=previous.closure_id; retryNotification=previous;
  }
  if(!['closure_created','invoice_sent','sent_to_payment','invoice_received'].includes(event||'')||!closureId) return json({error:'Evento ou fechamento inválido'},400);
  const {data:closure}=await admin.from('mei_closures').select('id,company_id,mei_id,period_start,period_end,total_value,mei_contracts(code,service)').eq('id',closureId).single();
  if(!closure) return json({error:'Fechamento não encontrado'},404);
  const {data:isCompany}=await admin.from('mei_company_users').select('user_id').eq('company_id',closure.company_id).eq('user_id',user.id).maybeSingle();
  const authorized=(event==='closure_created'||event==='sent_to_payment'||event==='invoice_received')?Boolean(isCompany):event==='invoice_sent'&&closure.mei_id===user.id;
  if(!authorized) return json({error:'Evento não autorizado'},403);

  const {data:invoice}=await admin.from('mei_invoices').select('invoice_number,issue_date').eq('closure_id',closure.id).maybeSingle();
  const {data:companyMembers}=await admin.from('mei_company_users').select('user_id').eq('company_id',closure.company_id);
  const {data:auditors}=await admin.from('mei_company_auditors').select('user_id').eq('company_id',closure.company_id);
  const ids=[closure.mei_id,...(companyMembers||[]).map(x=>x.user_id),...(auditors||[]).map(x=>x.user_id)];
  const {data:people}=await admin.from('mei_profiles').select('id,name,email,role').in('id',ids);
  const byId=new Map((people||[]).map(x=>[x.id,x]));
  const chooseRecipient=(role:string,userIds:string[])=>userIds.map(id=>byId.get(id)).filter((person):person is {id:string,name:string|null,email:string,role:string}=>Boolean(person?.email)).sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email),'pt-BR'))[0]||null;
  const recipient=retryNotification
    ? [...byId.values()].find(person=>person.email===retryNotification!.email)||{name:retryNotification.email,email:retryNotification.email,role:retryNotification.recipient_role}
    : event==='closure_created'
      ? chooseRecipient('mei',[closure.mei_id])
      : event==='invoice_sent'
        ? chooseRecipient('company',(companyMembers||[]).map(x=>x.user_id))
        : chooseRecipient('auditor',(auditors||[]).map(x=>x.user_id));
  const mailFrom=Deno.env.get('MAIL_FROM'); const resendKey=Deno.env.get('RESEND_API_KEY');
  if(!mailFrom||!resendKey) return json({error:'Serviço de e-mail não configurado'},503);
  const results=[];
  if(recipient?.email){
    const person=recipient;
    const recipientRole=retryNotification?.recipient_role||person.role;
    const recipientName=person.name||person.email;
    const subject=`${recipientName} // ${profile.name||profile.email} // Fechamento ${formatDate(closure.period_start)} a ${formatDate(closure.period_end)} // ${title[event!][recipientRole]}`;
    const attemptResult=await admin.from('mei_notifications').select('attempt').eq('closure_id',closure.id).eq('event',event!).eq('email',person.email).order('attempt',{ascending:false}).limit(1).maybeSingle();
    const attempt=(attemptResult.data?.attempt||0)+1;
    const {data:notification}=await admin.from('mei_notifications').insert({closure_id:closure.id,event,recipient_role:recipientRole,email:person.email,attempt,status:'pending'}).select('id').single();
    const contract=(closure.mei_contracts as {code?:string,service?:string}|null)||{};
    const html=`<p>Olá, ${escapeHtml(recipientName)}.</p><p>${escapeHtml(title[event!][recipientRole])}.</p><p><b>Contrato:</b> ${escapeHtml(contract.code)} — ${escapeHtml(contract.service)}<br><b>Período:</b> ${formatDate(closure.period_start)} a ${formatDate(closure.period_end)}<br><b>Valor do fechamento:</b> R$ ${Number(closure.total_value||0).toLocaleString('pt-BR',{minimumFractionDigits:2})}${invoice?`<br><b>NFSe:</b> ${escapeHtml(invoice.invoice_number)}`:''}</p><p>Esta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.</p>`;
    try{
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:mailFrom,to:[person.email],subject,html})});
      const payload=await response.json(); if(!response.ok) throw new Error(payload?.message||'Falha do provedor de e-mail');
      await admin.from('mei_notifications').update({status:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),provider_message_id:payload.id||null}).eq('id',notification!.id);
      results.push({email:person.email,status:'sent'});
    }catch(error){
      await admin.from('mei_notifications').update({status:'failed',error:String(error?.message||error).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',notification!.id);
      results.push({email:person.email,status:'failed'});
    }
  }
  return json({ok:true,results});
});
