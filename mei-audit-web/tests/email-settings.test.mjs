import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
import * as core from '../email-core.mjs';
const base=new URL('../../',import.meta.url);
export async function runEmailTests(){
 let checks=0;
 const check=(condition,message)=>{assert.ok(condition,message);checks++;};
 check(core.CATALOG.length===7,'Todos os sete modelos');
 for(const m of core.CATALOG){
  const rendered=core.renderTemplate(m,core.EXAMPLE);
  check(!rendered.subject.includes('{{')&&!rendered.html.includes('{{'),'Substituição completa: '+m.event);
  check(core.warnings(m,m.subject,m.body).length===0,'Padrão sem alertas');
 }
 const format=core.renderTemplate({subject:'Teste {{nome_destino}}',body:'# Título\n**forte**\n- um\n- dois\n1. três\nlinha\n{{nome_destino}}\n<script>alert(1)</script>'},{nome_destino:'<img src=x onerror=alert(1)> **injetado**'});
 check(format.html.includes('<h1>Título</h1>')&&format.html.includes('<strong>forte</strong>'),'Título e negrito');
 check(format.html.includes('<ul><li>um</li><li>dois</li></ul>')&&format.html.includes('<ol><li>três</li></ol>'),'Listas');
 check(!format.html.includes('<script>')&&!format.html.includes('<img')&&!format.html.includes('<strong>injetado'),'Escape de HTML e variáveis');
 check(core.warnings(core.CATALOG[0],'Livre','Sem campos').length>0,'Aviso sem bloqueio');
 core.validateTemplate('Livre','Sem campos');checks++;
 assert.throws(()=>core.validateTemplate('a\nb','c'));checks++;
 assert.throws(()=>core.validateTemplate('a','b'.repeat(30001)));checks++;
 check(core.renderTemplate({subject:'{{nome_destino}}',body:'{{desconhecido}}'},{nome_destino:'x\r\nBcc: y'}).subject==='x  Bcc: y','Sem injeção de cabeçalho');
 check(core.renderTemplate({subject:'x',body:'{{constructor}}'},{}).html.includes('campo indisponível'),'Sem propriedades herdadas');
 const helperText=fs.readFileSync(new URL('supabase/functions/_shared/email.ts',base),'utf8');
 const edgeText=fs.readFileSync(new URL('supabase/functions/mei-send-notification/index.ts',base),'utf8');
 const clean=s=>stripTypeScriptTypes(s.replace(/^import .*;\n/gm,''),{mode:'transform'}).replace(/\bexport /g,'');
 async function invoke(body,options={}){
  const caller=options.caller||'company';
  const user={id:caller,email:caller+'@example.com'};
  const people=[{id:'company',role:'company',name:'Dono',email:'company@example.com'},{id:'mei',role:'mei',name:'Maria',email:'mei@example.com'},{id:'audit1',role:'auditor',name:'Auditor A',email:'a@example.com'},{id:'audit2',role:'auditor',name:'Auditor B',email:'b@example.com'}];
  const calls=[],sent=[];
  const admin={auth:{admin:{generateLink:async args=>{calls.push({generateLink:args});return {data:{user:{id:'invited'},properties:{action_link:'https://example.com/secure-invite'}},error:null};}}},from(table){
   let filters={},operation='select',value;
   const query={
    select(){return query},eq(k,v){filters[k]=v;return query},in(){return query},order(){return query},limit(){return query},
    upsert(v){operation='insert';value=v;return query},insert(v){operation='insert';value=v;return query},update(v){operation='update';value=v;return query},
    single(){return query},maybeSingle(){return query},
    then(resolve,reject){
     calls.push({table,operation,filters:{...filters},value});
     let data=null,error=null;
     if(table==='mei_profiles')data=filters.id?people.find(p=>p.id===filters.id):people;
     if(table==='mei_closures')data={id:'closure',company_id:'cid',mei_id:'mei',period_start:'2026-10-01',period_end:'2026-10-31',total_value:2500,status:'awaiting_invoice',mei_contracts:{code:'CT-001',service:'Serviço'}};
     if(table==='mei_company_users')data=filters.user_id?(filters.user_id==='company'?{user_id:'company'}:null):[{user_id:'company'}];
     if(table==='mei_company_auditors')data=filters.user_id?(filters.user_id.startsWith('audit')?{user_id:filters.user_id}:null):[{user_id:'audit1'},{user_id:'audit2'}];
     if(table==='mei_invoices')data={invoice_number:'123',issue_date:'2026-11-01'};
     if(table==='mei_companies')data={name:'Empresa Teste'};
     if(table==='mei_email_templates')data=options.custom?{subject:'Personalizado {{nome_destino}}',body:'**Valor:** {{valor_total}}'}:null;
     if(table==='mei_notifications'){
      if(operation==='insert'){data={id:'notification'};if(options.duplicate)error={code:'23505'};}
      else if(filters.id&&operation==='select')data={event:'invoice_received',closure_id:'closure',email:'a@example.com',recipient_role:'auditor'};
      else data={attempt:0};
     }
     return Promise.resolve({data,error}).then(resolve,reject);
    }
   };return query;
  }};
  const userClient={from:admin.from,auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args)=>{
   calls.push({rpc:name,args});
   return options.denied?{error:{code:'42501',message:'Somente a Empresa principal'}}:{data:'test-id',error:null};
  }};
  let handler;
  const context={
   ...core, console,Response,Map,Set,Intl,Date,JSON,Number,String,Error,
   Deno:{env:{get:key=>key==='RESEND_API_KEY'?'fake-provider-key':key},serve:fn=>handler=fn},
   createClient:(url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?admin:userClient,
   fetch:async(url,request)=>{sent.push(JSON.parse(request.body));return new Response(JSON.stringify(options.providerFail?{message:'Falha simulada'}:{id:'provider-id'}),{status:options.providerFail?500:200});}
  };
  vm.createContext(context);
  vm.runInContext(clean(helperText),context);
  vm.runInContext(clean(options.invite?fs.readFileSync(new URL('supabase/functions/mei-invite-user/index.ts',base),'utf8'):edgeText),context);
  const response=await handler(new Request('https://example.com',{method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify(body)}));
  return {status:response.status,payload:await response.json(),calls,sent};
 }
 for(const [event,caller,addresses] of [
  ['closure_created','company',['mei@example.com']],['invoice_sent','mei',['company@example.com']],
  ['sent_to_payment','company',['a@example.com','b@example.com']],['erp_posted','audit1',['company@example.com']]
 ]){
  const result=await invoke({event,closure_id:'closure'},{caller});
  assert.deepEqual(result.sent.map(x=>x.to[0]),addresses);checks++;
  check(result.sent.every(x=>x.from===core.MAIL_FROM),'Remetente fixo');
  check(result.payload.results.every(x=>x.status==='sent'),'Envio registrado');
 }
 const retry=await invoke({action:'retry',notification_id:'old'});
 check(retry.sent[0].to[0]==='a@example.com','Reenvio histórico mantido');
 const unauthorized=await invoke({event:'closure_created',closure_id:'closure'},{caller:'mei'});
 check(unauthorized.status===403&&unauthorized.sent.length===0,'Evento indevido bloqueado');
 const custom=await invoke({event:'closure_created',closure_id:'closure'},{custom:true});
 check(custom.sent[0].subject==='Personalizado Maria'&&custom.sent[0].html.includes('2.500,00'),'Modelo do banco usado');
 const duplicate=await invoke({event:'closure_created',closure_id:'closure'},{duplicate:true});
 check(duplicate.sent.length===0&&duplicate.payload.results[0].status==='skipped','Idempotência preservada');
 const failed=await invoke({event:'closure_created',closure_id:'closure'},{providerFail:true});
 check(failed.payload.results[0].status==='failed'&&failed.calls.some(x=>x.value?.status==='failed'),'Falha registrada');
 const testBody={action:'test_template',company_id:'cid',event:'closure_created',recipient_role:'mei',subject:'Rascunho {{nome_destino}}',body:'Mensagem de teste',to:'intruso@example.com',from:'intruso@example.com'};
 const testResult=await invoke(testBody);
 check(testResult.sent[0].to[0]==='company@example.com'&&testResult.sent[0].from===core.MAIL_FROM,'Teste somente para usuário autenticado e remetente fixo');
 check(testResult.sent[0].subject.startsWith('[TESTE] Rascunho'),'Teste do rascunho');
 check(!testResult.calls.some(x=>x.table==='mei_notifications'),'Teste não afeta notificações reais');
 const denied=await invoke(testBody,{denied:true,caller:'mei'});
 check(denied.status===403&&denied.sent.length===0,'Teste negado para não proprietário');
 const invalid=await invoke({...testBody,recipient_role:'auditor'});
 check(invalid.status===400&&invalid.sent.length===0,'Par evento/destinatário inválido bloqueado');
 const invite=await invoke({company_id:'cid',email:'new@example.com',role:'mei',name:'Novo MEI',redirect_to:'https://example.com/app'},{invite:true});
 check(invite.payload.ok&&invite.sent[0].to[0]==='new@example.com','Convite enviado ao destinatário atual');
 check(invite.sent[0].html.includes('https://example.com/secure-invite')&&invite.sent[0].from===core.MAIL_FROM,'Convite com link seguro e remetente fixo');
 check(invite.calls.some(x=>x.generateLink?.type==='invite'&&x.generateLink.options.data.company_id==='cid'),'Metadados e fluxo de convite preservados');
 const noInvite=await invoke({company_id:'cid',email:'new@example.com',role:'mei',name:'Novo'},{invite:true,caller:'mei'});
 check(!noInvite.payload.ok&&noInvite.sent.length===0,'Convite sem permissão bloqueado');
 return checks;
}
console.log('OK - '+await runEmailTests()+' verificações de e-mails aprovadas.');
