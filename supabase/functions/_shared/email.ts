import { MAIL_FROM, definition, renderTemplate } from '../../../mei-audit-web/email-core.mjs';
export { definition, renderTemplate };
export async function contentFor(admin:any,companyId:string,event:string,role:string){
 const standard=definition(event,role);
 if(!standard)throw new Error('Modelo de e-mail não localizado');
 const {data,error}=await admin.from('mei_email_templates').select('subject,body').eq('company_id',companyId).eq('event',event).eq('recipient_role',role).maybeSingle();
 if(error)throw error;
 return data||standard;
}
export async function sendMail(to:string,content:{subject:string,html:string}){
 const key=Deno.env.get('RESEND_API_KEY');
 if(!key)throw new Error('Serviço de e-mail não configurado');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from:MAIL_FROM,to:[to],...content})});
 const payload=await response.json();
 if(!response.ok)throw new Error(payload?.message||'Falha do provedor de e-mail');
 return payload;
}
