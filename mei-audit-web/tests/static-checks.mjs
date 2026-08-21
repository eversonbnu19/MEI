import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const adjustments=read('patch-entry-adjustments.js');
const logoutPatch=read('patch-logout-return.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v27/,'index deve identificar visualmente a versao v27');
assert.match(index,/boot\.js\?v=27/,'index deve carregar boot v27');
assert.match(boot,/const APP_VERSION='v27'/,'boot deve declarar v27');
assert.match(boot,/mei-company-status/,'entrada deve consultar se a empresa principal ja existe');
assert.match(boot,/const signupBlock=exists\?'':/,'cadastro inicial deve aparecer apenas quando nao existe empresa');
assert.match(boot,/if\(await companyExists\(\)\)/,'rota de cadastro deve bloquear quando empresa ja existe');
assert.match(boot,/return true;/,'falha na verificacao deve ocultar cadastro por seguranca');
assert.match(boot,/app\.js\?v=27/,'boot deve carregar app v27');
assert.match(boot,/patch-logout-return\.js\?v=27/,'boot deve carregar hotfix de logout v27');

assert.match(logoutPatch,/#logout/,'hotfix deve detectar clique em sair');
assert.match(logoutPatch,/#app \.login #signup/,'hotfix deve detectar a tela antiga de login');
assert.match(logoutPatch,/location\.replace\('\.\/'\)/,'logout deve retornar para entrada oficial');
assert.match(logoutPatch,/MutationObserver/,'hotfix deve observar apenas a transicao de tela');

assert.match(adjustments,/Correção de lançamentos/,'correcao de lancamentos deve permanecer');
assert.match(adjustments,/Bloqueado após envio da NF/,'bloqueio apos NF deve permanecer');
assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve manter escopo operacional');
assert.match(sw,/gestao-contratos-v27/,'service worker deve usar cache v27');
assert.match(sw,/patch-logout-return\.js/,'service worker deve incluir hotfix de logout');

console.log('OK - retorno de logout validado para v27.');
