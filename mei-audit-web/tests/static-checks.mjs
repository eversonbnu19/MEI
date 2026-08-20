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

assert.match(index,/Gestão de Contratos v12/,'index deve identificar visualmente a versao v12');
assert.match(index,/entry-guard\.js\?v=12/,'index deve carregar a protecao v12');
assert.match(index,/boot\.js\?v=12/,'index deve carregar o boot v12');
assert.match(boot,/const APP_VERSION='v12'/,'boot deve declarar a versao v12');
assert.match(boot,/Versão \$\{APP_VERSION\}/,'tela inicial deve exibir a versao');
assert.match(boot,/Versão \$\{window\.__GESTAO_APP_VERSION__/,'cabecalho interno deve exibir a versao');
assert.match(boot,/__GESTAO_TAB_NAV_BOUND__/,'navegacao deve ser vinculada uma unica vez');
assert.match(boot,/closest\?\.\('\[data-tab\]'\)/,'navegacao deve usar delegacao de eventos');
assert.match(boot,/Promise\.resolve\(render\(\)\)/,'clique em aba deve renderizar o conteudo');
assert.match(boot,/let appOpenPromise=null/,'boot deve ter trava de inicializacao');
assert.match(boot,/if\(appOpenPromise\) return appOpenPromise/,'openApp deve reutilizar a mesma inicializacao');
assert.match(boot,/__GESTAO_AFTER_LOGIN_PROMISE__/,'afterLogin deve ter trava contra execucao concorrente');
assert.match(boot,/__GESTAO_AFTER_LOGIN_USER__/,'afterLogin deve evitar registrar a mesma sessao duas vezes');
assert.match(app,/mei_start_hour/,'fluxo MEI deve possuir RPC de entrada');
assert.match(app,/mei_end_hour/,'fluxo MEI deve possuir RPC de saida');
assert.match(guard,/data-start/,'guard deve proteger entrada');
assert.match(guard,/data-end/,'guard deve proteger saida');
assert.match(sw,/gestao-contratos-v12/,'service worker deve usar cache v12');
assert.match(sw,/entry-guard\.js/,'service worker deve incluir o guard no cache');

console.log('OK - verificacoes estruturais do fluxo MEI v12 passaram.');
