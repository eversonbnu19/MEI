import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const auditPayment=read('patch-audit-payment.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v24/,'index deve identificar visualmente a versao v24');
assert.match(index,/boot\.js\?v=24/,'index deve carregar boot v24');
assert.match(boot,/const APP_VERSION='v24'/,'boot deve declarar v24');
assert.match(boot,/app\.js\?v=24/,'boot deve carregar app v24');
assert.match(boot,/patch-audit-payment\.js\?v=24/,'boot deve carregar modulo de contas a pagar v24');

assert.match(app,/mei_send_to_payment/,'empresa deve manter fluxo de envio ao pagamento');
assert.match(auditPayment,/sent_to_payment/,'NF deve ser liberada apenas apos envio ao pagamento');
assert.match(auditPayment,/Baixar NF/,'auditoria deve ter botao para baixar NF');
assert.match(auditPayment,/createSignedUrl/,'download deve usar URL assinada do arquivo original');
assert.match(auditPayment,/mei-invoices/,'download deve usar bucket de notas fiscais');
assert.match(auditPayment,/storage_path/,'download deve usar caminho armazenado da nota fiscal');
assert.match(auditPayment,/aguardando envio ao pagamento/,'antes do envio ao pagamento a NF nao deve ser liberada');
assert.match(auditPayment,/Auditoria da empresa/,'modulo deve atuar apenas no perfil Auditoria');
assert.doesNotMatch(auditPayment,/\.delete\(/,'modulo nao deve excluir dados');
assert.doesNotMatch(auditPayment,/location\.reload\(\)/,'modulo nao deve recarregar pagina');

assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve manter escopo operacional');
assert.match(sw,/gestao-contratos-v24/,'service worker deve usar cache v24');
assert.match(sw,/patch-audit-payment\.js/,'service worker deve incluir modulo de contas a pagar');

console.log('OK - NF para Auditoria Contas a Pagar validada para v24.');
