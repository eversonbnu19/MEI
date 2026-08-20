import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve(process.cwd(),'mei-audit-web');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

const index=read('index.html');
const boot=read('boot.js');
const app=read('app.js');
const guard=read('entry-guard.js');
const sw=read('sw.js');

assert.match(index,/Gestão de Contratos v11/,'index deve identificar visualmente a versao v11');
assert.match(index,/entry-guard\.js\?v=11/,'index deve carregar a protecao v11');
assert.match(index,/boot\.js\?v=11/,'index deve carregar o boot v11');
assert.match(boot,/const APP_VERSION='v11'/,'boot deve declarar a versao v11');
assert.match(boot,/Versão \$\{APP_VERSION\}/,'tela inicial deve exibir a versao');
assert.match(boot,/let appOpenPromise=null/,'boot deve ter trava de inicializacao');
assert.match(boot,/if\(appOpenPromise\) return appOpenPromise/,'openApp deve reutilizar a mesma inicializacao');
assert.match(boot,/__GESTAO_AFTER_LOGIN_PROMISE__/,'afterLogin deve ter trava contra execucao concorrente');
assert.match(boot,/__GESTAO_AFTER_LOGIN_USER__/,'afterLogin deve evitar registrar a mesma sessao duas vezes');
assert.match(boot,/if\(isCompanySignup\)[\s\S]*showCompanySignup\(\)[\s\S]*else[\s\S]*restoreSession\(\)/,'restoreSession nao deve substituir a tela de cadastro');
assert.match(app,/mei_start_hour/,'fluxo MEI deve possuir RPC de entrada');
assert.match(app,/mei_end_hour/,'fluxo MEI deve possuir RPC de saida');
assert.match(guard,/data-start/,'guard deve proteger entrada');
assert.match(guard,/data-end/,'guard deve proteger saida');
assert.match(guard,/stopImmediatePropagation/,'guard deve bloquear repeticao da mesma acao');
assert.match(sw,/gestao-contratos-v11/,'service worker deve usar cache v11');
assert.match(sw,/entry-guard\.js/,'service worker deve incluir o guard no cache');

console.log('OK - verificacoes estruturais do fluxo MEI v11 passaram.');
