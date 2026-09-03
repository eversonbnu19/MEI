import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const adjustments=read('patch-entry-adjustments.js');
const preclose=read('patch-preclose-review.js');
const logoutPatch=read('patch-logout-return.js');
const notifications=read('patch-notifications.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v31/,'index deve identificar visualmente a versao v31');
assert.match(index,/boot\.js\?v=31/,'index deve carregar boot v31');
assert.match(index,/entry-guard\.js\?v=31/,'index deve carregar guarda de entrada v31');
assert.match(boot,/const APP_VERSION='v31'/,'boot deve declarar v31');
assert.match(boot,/mei-company-status/,'entrada deve consultar se a empresa principal ja existe');
assert.match(boot,/const signupBlock=exists\?'':/,'cadastro inicial deve aparecer apenas quando nao existe empresa');
assert.match(boot,/if\(await companyExists\(\)\)/,'rota de cadastro deve bloquear quando empresa ja existe');
assert.match(boot,/return true;/,'falha na verificacao deve ocultar cadastro por seguranca');
assert.match(boot,/app\.js\?v=31/,'boot deve carregar app v31');
assert.match(boot,/patch-preclose-review\.js\?v=31/,'boot deve carregar pre-conferencia v31');
assert.match(boot,/patch-notifications\.js\?v=31/,'boot deve carregar notificações v31');
assert.match(boot,/patch-logout-return\.js\?v=31/,'boot deve carregar hotfix de logout v31');
assert.match(app,/navigator\.geolocation\.getCurrentPosition/,'registro por hora deve solicitar GPS');
assert.match(app,/maximumAge:0/,'registro deve rejeitar localização em cache');
assert.match(app,/p_latitude:gps\.latitude/,'entrada deve enviar coordenada ao servidor');
assert.match(app,/p_accuracy:gps\.accuracy/,'registro deve enviar precisão ao servidor');

assert.match(logoutPatch,/#logout/,'hotfix deve detectar clique em sair');
assert.match(logoutPatch,/#app \.login #signup/,'hotfix deve detectar a tela antiga de login');
assert.match(logoutPatch,/location\.replace\('\.\/'\)/,'logout deve retornar para entrada oficial');
assert.match(logoutPatch,/MutationObserver/,'hotfix deve observar apenas a transicao de tela');

assert.match(adjustments,/Correção de lançamentos/,'correcao de lancamentos deve permanecer');
assert.match(adjustments,/Bloqueado após envio da NF/,'bloqueio apos NF deve permanecer');
assert.match(preclose,/Pré-conferência do período/,'pre-conferencia deve estar disponível em Fechamentos');
assert.match(preclose,/Conferir período/,'fluxo deve exigir conferência antes do fechamento');
assert.match(preclose,/Confirmar fechamento/,'fechamento deve exigir confirmação posterior');
assert.match(preclose,/mei_company_add_hour_entry/,'inclusão por hora deve usar função auditável');
assert.match(preclose,/mei_company_add_piece_entry/,'inclusão por peça deve usar função auditável');
assert.match(preclose,/Lançamento por hora em andamento\/sem saída/,'hora sem saída deve bloquear o fechamento');
assert.match(preclose,/Dia útil sem lançamento/,'dia útil sem lançamento deve ser alertado');
assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve manter escopo operacional');
assert.match(notifications,/mei-send-notification/,'notificações devem ser chamadas pela Edge Function');
assert.match(notifications,/closure_created/,'fechamento deve gerar notificação');
assert.match(notifications,/invoice_sent/,'envio de NF deve gerar notificação');
assert.match(notifications,/sent_to_payment/,'envio ao pagamento deve gerar notificação para auditoria');
assert.doesNotMatch(notifications,/mei_mark_invoice_received/,'download da NF não deve disparar notificação para auditoria');
assert.match(notifications,/data-notification-retry/,'falhas devem permitir reenvio');
assert.match(sw,/gestao-contratos-v31/,'service worker deve usar cache v31');
assert.match(sw,/patch-notifications\.js/,'service worker deve incluir notificações');
assert.match(sw,/patch-preclose-review\.js/,'service worker deve incluir a pré-conferência');
assert.match(sw,/patch-logout-return\.js/,'service worker deve incluir hotfix de logout');

console.log('OK - v31 com notificações transacionais validada.');
