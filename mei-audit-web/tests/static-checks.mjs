import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const adjustments=read('patch-entry-adjustments.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v26/,'index deve identificar visualmente a versao v26');
assert.match(index,/boot\.js\?v=26/,'index deve carregar boot v26');
assert.match(boot,/const APP_VERSION='v26'/,'boot deve declarar v26');
assert.match(boot,/mei-company-status/,'entrada deve consultar se a empresa principal ja existe');
assert.match(boot,/const signupBlock=exists\?'':/,'cadastro inicial deve aparecer apenas quando nao existe empresa');
assert.match(boot,/if\(await companyExists\(\)\)/,'rota de cadastro deve bloquear quando empresa ja existe');
assert.match(boot,/history\.replaceState/,'rota direta de cadastro deve retornar ao login sem recarregar');
assert.match(boot,/return true;/,'falha na verificacao deve ocultar cadastro por seguranca');
assert.match(boot,/app\.js\?v=26/,'boot deve carregar app v26');
assert.match(boot,/patch-entry-adjustments\.js\?v=26/,'ajustes v25 devem permanecer carregados');

assert.match(adjustments,/Correção de lançamentos/,'correcao de lancamentos deve permanecer');
assert.match(adjustments,/Bloqueado após envio da NF/,'bloqueio apos NF deve permanecer');
assert.match(guard,/ACTION_SELECTOR='\[data-start\],\[data-end\],\[data-piece\],\[data-invoice\],\[data-pay\],\[data-download\]'/,'guard deve manter escopo operacional');
assert.match(sw,/gestao-contratos-v26/,'service worker deve usar cache v26');

console.log('OK - cadastro unico de empresa validado para v26.');
