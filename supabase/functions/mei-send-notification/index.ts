import { contentFor, sendMail, definition, renderTemplate } from '../_shared/email.ts';
import {EXAMPLE,validateTemplate} from '../../../mei-audit-web/email-core.mjs';
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
function formatDate(value:string){return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date(`${value}T12:00:00Z`));}

Deno.serve(async request=>{
  try{
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


  if(body.action==='test_template'){
    const model=definition(body.event,body.recipient_role);
    if(!model) return json({error:'Modelo inválido'},400);
    try{
      validateTemplate(body.subject,body.body);
      const {data:testId,error:reserveError}=await userClient.rpc('mei_reserve_email_test',{p_company:body.company_id,p_event:body.event,p_role:body.recipient_role});
      if(reserveError)return json({error:reserveError.message},reserveError.code==='42501'?403:429);
      if(!user.email) return json({error:'Seu acesso não possui e-mail confirmado'},400);
      try{
        const rendered=renderTemplate({subject:body.subject,body:body.body},EXAMPLE);
        const payload=await sendMail(user.email,{...rendered,subject:'[TESTE] '+rendered.subject});
        const {error:logError}=await admin.from('mei_email_tests').update({status:'sent',provider_message_id:payload.id||null}).eq('id',testId);
        if(logError)throw logError;
        return json({ok:true,email:user.email});
      }catch(error){
        await admin.from('mei_email_tests').update({status:'failed',error:String(error?.message||error).slice(0,1000)}).eq('id',testId);
        return json({error:'Falha ao enviar o teste. Consulte o histórico de testes ou tente novamente.'},502);
      }
    }catch(error){return json({error:String(error?.message||error)},400);}
  }

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
  if(!['closure_created','invoice_sent','sent_to_payment','erp_posted','invoice_received'].includes(event||'')||!closureId) return json({error:'Evento ou fechamento inválido'},400);
  const {data:closure}=await admin.from('mei_closures').select('id,company_id,mei_id,period_start,period_end,total_value,status,mei_contracts(code,service)').eq('id',closureId).single();
  if(!closure) return json({error:'Fechamento não encontrado'},404);
  const {data:isCompany}=await admin.from('mei_company_users').select('user_id').eq('company_id',closure.company_id).eq('user_id',user.id).maybeSingle();
  const {data:isAuditor}=await admin.from('mei_company_auditors').select('user_id').eq('company_id',closure.company_id).eq('user_id',user.id).maybeSingle();
  const authorized=(event==='closure_created'||event==='sent_to_payment'||event==='invoice_received')
    ? Boolean(isCompany)
    : event==='erp_posted'
      ? Boolean(isAuditor)
      : event==='invoice_sent'&&closure.mei_id===user.id;
  if(!authorized) return json({error:'Evento não autorizado'},403);

  const {data:invoice}=await admin.from('mei_invoices').select('invoice_number,issue_date').eq('closure_id',closure.id).maybeSingle();
  const {data:companyMembers}=await admin.from('mei_company_users').select('user_id').eq('company_id',closure.company_id);
  const {data:auditors}=await admin.from('mei_company_auditors').select('user_id').eq('company_id',closure.company_id);
  const ids=[closure.mei_id,...(companyMembers||[]).map(x=>x.user_id),...(auditors||[]).map(x=>x.user_id)];
  const {data:people}=await admin.from('mei_profiles').select('id,name,email,role').in('id',ids);
  const byId=new Map((people||[]).map(x=>[x.id,x]));
  const eligiblePeople=(userIds:string[])=>userIds.map(id=>byId.get(id)).filter((person):person is {id:string,name:string|null,email:string,role:string}=>Boolean(person?.email)).sort((a,b)=>String(a.name||a.email).localeCompare(String(b.name||b.email),'pt-BR'));
  const recipient=retryNotification
    ? [...byId.values()].find(person=>person.email===retryNotification!.email)||{name:retryNotification.email,email:retryNotification.email,role:retryNotification.recipient_role}
    : event==='closure_created'
      ? eligiblePeople([closure.mei_id])[0]||null
      : event==='invoice_sent'
        ? eligiblePeople((companyMembers||[]).map(x=>x.user_id))[0]||null
        : event==='erp_posted'
          ? eligiblePeople((companyMembers||[]).map(x=>x.user_id))[0]||null
          : null;
  const recipients=retryNotification
    ? [recipient].filter(Boolean)
    : event==='sent_to_payment'
      ? eligiblePeople((auditors||[]).map(x=>x.user_id))
      : [recipient].filter(Boolean);
  const resendKey=Deno.env.get('RESEND_API_KEY');
  if(!resendKey) return json({error:'Serviço de e-mail não configurado'},503);
  const results=[];
  for(const person of recipients){
    const recipientRole=retryNotification?.recipient_role||person.role;
    const recipientName=person.name||person.email;
    const template=await contentFor(admin,closure.company_id,event!,recipientRole);
    const {data:company}=await admin.from('mei_companies').select('name').eq('id',closure.company_id).single();
    const attemptResult=await admin.from('mei_notifications').select('attempt').eq('closure_id',closure.id).eq('event',event!).eq('email',person.email).order('attempt',{ascending:false}).limit(1).maybeSingle();
    const attempt=(attemptResult.data?.attempt||0)+1;
    const {data:notification,error:notificationError}=await admin.from('mei_notifications').insert({closure_id:closure.id,event,recipient_role:recipientRole,email:person.email,attempt,status:'pending'}).select('id').single();
    if(notificationError){
      // Uma solicitação concorrente já registrou/envia este mesmo aviso. Reenvios
      // continuam permitidos porque usam uma linha anterior com status failed.
      if(notificationError.code==='23505'){results.push({email:person.email,status:'skipped'});continue;}
      throw notificationError;
    }
    const contract=(closure.mei_contracts as {code?:string,service?:string}|null)||{};
    const rendered=renderTemplate(template,{nome_destino:recipientName,nome_origem:profile.name||profile.email,periodo_inicio:formatDate(closure.period_start),periodo_fim:formatDate(closure.period_end),contrato_codigo:contract.code||'—',contrato_servico:contract.service||'—',valor_total:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(closure.total_value||0)),numero_nfse:invoice?.invoice_number||'—',data_emissao:invoice?.issue_date?formatDate(invoice.issue_date):'—',status:definition(event!,recipientRole)?.label||closure.status,nome_empresa:company?.name||'—'});
    try{
      const payload=await sendMail(person.email,rendered);
      await admin.from('mei_notifications').update({status:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),provider_message_id:payload.id||null}).eq('id',notification!.id);
      results.push({email:person.email,status:'sent'});
    }catch(error){
      await admin.from('mei_notifications').update({status:'failed',error:String(error?.message||error).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',notification!.id);
      results.push({email:person.email,status:'failed'});
    }
  }
  return json({ok:true,results});
  }catch(error){console.error('Falha de notificação',error);return json({error:'Não foi possível processar a notificação.'},500);}
});
