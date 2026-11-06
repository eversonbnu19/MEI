// Shared by preview, tests and Edge Functions. Store text/Markdown, never executable HTML.
export const MAIL_FROM = 'Gestão de Contratos <enviados@gelasio.com.br>';
export const FIELDS = {
 nome_destino:'Nome do destinatário', nome_origem:'Nome de quem realizou a ação',
 periodo_inicio:'Início do período', periodo_fim:'Fim do período',
 contrato_codigo:'Código do contrato', contrato_servico:'Serviço contratado',
 valor_total:'Valor do fechamento', numero_nfse:'Número da NFSe', data_emissao:'Emissão da NFSe',
 status:'Situação do evento', nome_empresa:'Nome da empresa', link_acesso:'Link seguro de acesso', lista_contratos_pendentes:'Contratos, períodos e horas pendentes', link_fechamentos:'Link para fechamentos', data_aviso:'Data do aviso', quantidade_contratos:'Quantidade de contratos pendentes'
};
const common=['nome_destino','nome_origem','periodo_inicio','periodo_fim','contrato_codigo','contrato_servico','valor_total','numero_nfse','data_emissao','status','nome_empresa'];
const events=[
 ['closure_created','mei','Fechamento realizado - emitir NFSe'],
 ['invoice_sent','company','NFSe enviada - aguardando autorização'],
 ['sent_to_payment','auditor','NFSe liberada para conferência final e lançamento no ERP'],
 ['erp_posted','company','NFSe lançada no ERP'],
 ['invoice_received','auditor','NFSe disponível para conferência']
];
export const CATALOG=events.map(([event,recipient_role,label])=>({
 event,recipient_role,label,fields:common,
 important:['nome_destino','periodo_inicio','periodo_fim','contrato_codigo','valor_total'],
 subject:'{{nome_destino}} // {{nome_origem}} // Fechamento {{periodo_inicio}} a {{periodo_fim}} // '+label,
 body:'Olá, {{nome_destino}}.\n\n'+label+'.\n\n**Contrato:** {{contrato_codigo}} — {{contrato_servico}}\n**Período:** {{periodo_inicio}} a {{periodo_fim}}\n**Valor do fechamento:** {{valor_total}}'+(event==='closure_created'?'':'\n**NFSe:** {{numero_nfse}}')+'\n\nEsta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'
})).concat(['mei','auditor'].map(recipient_role=>({
 event:'user_invited',recipient_role,label:'Convite de acesso — '+(recipient_role==='mei'?'MEI':'Auditoria'),
 fields:['nome_destino','nome_origem','nome_empresa','link_acesso','status'],
 important:['nome_destino','link_acesso'],
 subject:'Convite para Gestão de Contratos — {{nome_empresa}}',
 body:'Olá, {{nome_destino}}.\n\n{{nome_origem}} convidou você para acessar a empresa {{nome_empresa}} no Gestão de Contratos.\n\nAcesse o link seguro para ativar seu acesso:\n{{link_acesso}}\n\nEsta mensagem foi gerada automaticamente pelo sistema Gestão de Contratos.'
}))).concat([{event:'closure_reminder',recipient_role:'company',label:'Lembrete de fechamento de horas',fields:['nome_destino','nome_empresa','lista_contratos_pendentes','link_fechamentos','data_aviso','quantidade_contratos'],important:['lista_contratos_pendentes','link_fechamentos'],subject:'Fechamento de horas pendente — {{nome_empresa}}',body:'Olá, {{nome_destino}}.\n\nHá horas aguardando fechamento nos contratos abaixo:\n\n{{lista_contratos_pendentes}}\n\n{{link_fechamentos}}\n\nAviso de {{data_aviso}}. Confira e realize o fechamento no sistema.'}]);
export const EXAMPLE={nome_destino:'Maria Exemplo',nome_origem:'João Administrador',periodo_inicio:'01/10/2026',periodo_fim:'31/10/2026',contrato_codigo:'CT-EXEMPLO-001',contrato_servico:'Serviço de demonstração',valor_total:'R$ 2.500,00',numero_nfse:'12345',data_emissao:'01/11/2026',status:'Exemplo de situação',nome_empresa:'Empresa Exemplo',link_acesso:'https://example.com/acesso-ficticio',lista_contratos_pendentes:'CT-EXEMPLO-001 — Maria Exemplo\nPeríodo: 01/10/2026 a 31/10/2026\nHoras sem fechamento: 80',link_fechamentos:'https://example.com/fechamentos-ficticios',data_aviso:'01/11/2026',quantidade_contratos:'1'};
export const escapeHtml=value=>String(value??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function definition(event,role){return CATALOG.find(x=>x.event===event&&x.recipient_role===role);}
export function warnings(model,subject,body){
 const text=subject+'\n'+body;
 const used=[...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map(m=>m[1]);
 return [...model.important.filter(k=>!used.includes(k)).map(k=>'Campo importante ausente: {{'+k+'}}'),
 ...[...new Set(used)].filter(k=>!model.fields.includes(k)).map(k=>'Campo desconhecido para este modelo: {{'+k+'}}')];
}
export function validateTemplate(subject,body){
 if(typeof subject!=='string'||!subject.trim()||subject.length>500||/[\r\n]/.test(subject)) throw new Error('Informe um assunto de até 500 caracteres, em uma linha.');
 if(typeof body!=='string'||!body.trim()||body.length>30000) throw new Error('Informe uma mensagem de até 30.000 caracteres.');
}
function substitute(text,values,transform){
 return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(_,key)=>transform(Object.hasOwn(values,key)?values[key]:'[campo indisponível: '+key+']'));
}
export function renderTemplate(template,values){
 validateTemplate(template.subject,template.body);
 const subject=substitute(template.subject,values,v=>String(v??'—').replace(/[\r\n]/g,' '));
 // Format the author's text first; inserted values cannot create markup or Markdown.
 const parts=[];
 const protectedText=template.body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g,(_,key)=>{
  const value=Object.hasOwn(values,key)?values[key]:'[campo indisponível: '+key+']';
  let safe=escapeHtml(value);
  if(['link_acesso','link_fechamentos'].includes(key)&&/^https:\/\//i.test(String(value))) safe='<a href="'+escapeHtml(value)+'">'+(key==='link_fechamentos'?'Ver fechamentos':'Ativar acesso')+'</a>';
  safe=safe.replace(/\r?\n/g,'<br>');
  parts.push(safe); return '\uE000'+(parts.length-1)+'\uE001';
 });
 const inline=s=>escapeHtml(s).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\uE000(\d+)\uE001/g,(_,i)=>parts[Number(i)]);
 let html='',list='';
 for(const line of protectedText.split(/\r?\n/)){
  const item=line.match(/^\s*(- |\d+\. )(.*)$/);
  if(item){const type=item[1]==='- '?'ul':'ol';if(list!==type){if(list)html+='</'+list+'>';html+='<'+type+'>';list=type;}html+='<li>'+inline(item[2])+'</li>';continue;}
  if(list){html+='</'+list+'>';list='';}
  const heading=line.match(/^(#{1,3}) (.*)$/);
  html+=heading?'<h'+heading[1].length+'>'+inline(heading[2])+'</h'+heading[1].length+'>':line?'<div>'+inline(line)+'</div>':'<br>';
 }
 if(list) html+='</'+list+'>';
 return {subject,html:'<div style="font-family:Arial,sans-serif;line-height:1.6;color:#182230">'+html+'</div>'};
}
