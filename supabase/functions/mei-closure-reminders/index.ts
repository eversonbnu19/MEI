import {createClient} from 'npm:@supabase/supabase-js@2.57.4';
import {periods,localDate,summaryText,SITE_URL} from '../../../mei-audit-web/closure-reminders-core.mjs';
import {contentFor,renderTemplate,sendMail} from '../_shared/email.ts';
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
Deno.serve(async request=>{
 if(request.method!=='POST')return json({error:'Método não permitido'},405);
 const token=request.headers.get('X-Reminder-Token');
 if(!token)return json({error:'Agendamento não autorizado'},401);
 const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
 const {data:run,error:beginError}=await admin.rpc('mei_begin_reminder_run',{p_token:token});
 if(beginError)return json({error:'Agendamento não autorizado'},403);
 if(!run)return json({ok:true,skipped:true});
 const call=async(action:string,payload:unknown={})=>{
  const {data,error}=await admin.rpc('mei_reminder_worker',{p_action:action,p_run:run,p_payload:payload});
  if(error)throw error;return data;
 };
 try{
  const today=localDate(new Date());
  const {data:settings,error}=await admin.from('mei_closure_reminder_settings').select('*').eq('enabled',true);
  if(error)throw error;
  const candidates=(settings||[]).flatMap(s=>periods(s,today).map(p=>({...p,contract_id:s.contract_id,revision:s.revision})));
  // Bounded RPC batches avoid oversized requests for older configured periods.
  for(let i=0;i<candidates.length;i+=500)await call('sync',{periods:candidates.slice(i,i+500)});
  const deliveries=await call('claim');
  const results=[];
  for(const delivery of deliveries){
   try{
    const {data:{user},error:ownerError}=await admin.auth.admin.getUserById(delivery.owner_id);
    if(ownerError||!user?.email)throw new Error('E-mail da Empresa principal indisponível');
    let current=delivery;
    if(!current.content){
     const template=await contentFor(admin,delivery.company_id,'closure_reminder','company');
     const {data:profile,error:profileError}=await admin.from('mei_profiles').select('name').eq('id',delivery.owner_id).single();
     if(profileError)throw profileError;
     const rendered=renderTemplate(template,{nome_destino:profile?.name||user.email,nome_empresa:delivery.company_name,lista_contratos_pendentes:summaryText(delivery.items),link_fechamentos:SITE_URL,data_aviso:today.split('-').reverse().join('/'),quantidade_contratos:String(new Set(delivery.items.map(x=>x.contract_id)).size)});
     current=await call('content',{id:delivery.id,email:user.email,content:rendered});
    }
    if(current.email!==user.email)throw new Error('E-mail do titular alterado; aguarde o próximo aviso');
    const validation=await call('validate',{id:delivery.id});
    if(!validation.valid){results.push({id:delivery.id,status:'suppressed'});continue;}
    const sent=await sendMail(current.email,current.content,'closure-reminder/'+delivery.id);
    await call('finish',{id:delivery.id,status:'sent',provider_message_id:sent.id||null});
    results.push({id:delivery.id,status:'sent'});
   }catch(error){
    await call('finish',{id:delivery.id,status:'failed',error:String(error?.message||error)});
    results.push({id:delivery.id,status:'failed'});
   }
  }
  return json({ok:true,results});
 }catch(error){console.error('Falha nos lembretes de fechamento',error);return json({error:'Falha ao processar lembretes'},500);}
 finally{await call('release').catch(error=>console.error('Falha ao liberar execução',error));}
});
