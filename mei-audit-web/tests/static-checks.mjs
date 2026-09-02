import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const adjustments=read('patch-entry-adjustments.js');
const preclose=read('patch-preclose-review.js');
const logoutPatch=read('patch-logout-return.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v28/,'index deve identificar visualmente a versao v28');
assert.match(index,/boot\.js\?v=28/,'index deve carregar boot v28');
assert.match(boot,/const APP_VERSION='v28'/,'boot deve declarar v28');
assert.match(boot,/mei-company-status/,'entrada deve consultar se a empresa principal ja existe');
assert.match(boot,/const signupBlock=exists\?'':/,'cadastro inicial deve aparecer apenas quando nao existe empresa');
assert.match(boot,/if\(await companyExists\(\)\)/,'rota de cadastro deve bloquear quando empresa ja existe');
assert.match(boot,/return true;/,'falha na verificacao deve ocultar cadastro por seguranca');
assert.match(boot,/app\.js\?v=28/,'boot deve carregar app v28');
assert.match(boot,/patch-preclose-review\.js\?v=28/,'boot deve carregar pre-conferencia v28');
assert.match(boot,/patch-logout-return\.js\?v=28/,'boot deve carregar hotfix de logout v28');

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
assert.match(sw,/gestao-contratos-v28/,'service worker deve usar cache v28');
assert.match(sw,/patch-preclose-review\.js/,'service worker deve incluir a pré-conferência');
assert.match(sw,/patch-logout-return\.js/,'service worker deve incluir hotfix de logout');

console.log('OK - v28 com pré-conferência validada.');
