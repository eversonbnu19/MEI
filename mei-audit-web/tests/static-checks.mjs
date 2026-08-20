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
const styles=read('styles.css');

assert.match(index,/Gestão de Contratos v13/,'index deve identificar visualmente a versao v13');
assert.match(index,/entry-guard\.js\?v=13/,'index deve carregar a protecao v13');
assert.match(index,/boot\.js\?v=13/,'index deve carregar o boot v13');
assert.match(index,/styles\.css\?v=13/,'index deve carregar estilos v13');
assert.match(boot,/const APP_VERSION='v13'/,'boot deve declarar a versao v13');
assert.match(boot,/Versão \$\{APP_VERSION\}/,'tela inicial deve exibir a versao');
assert.match(boot,/Versão \$\{window\.__GESTAO_APP_VERSION__/,'cabecalho interno deve exibir a versao');
assert.match(boot,/href=\\"\?tab=\$\{encodeURIComponent\(x\[0\]\)\}\\"/,'abas devem ser links nativos');
assert.match(boot,/new URLSearchParams\(location\.search\)\.get\('tab'\)/,'painel deve ler a aba pela URL');
assert.doesNotMatch(boot,/__GESTAO_TAB_NAV_BOUND__/,'v13 nao deve depender de listener delegado para abas');
assert.match(styles,/\.tabs a\{/,'estilos devem cobrir links de abas');
assert.match(boot,/let appOpenPromise=null/,'boot deve ter trava de inicializacao');
assert.match(boot,/if\(appOpenPromise\) return appOpenPromise/,'openApp deve reutilizar a mesma inicializacao');
assert.match(boot,/__GESTAO_AFTER_LOGIN_PROMISE__/,'afterLogin deve ter trava contra execucao concorrente');
assert.match(app,/mei_start_hour/,'fluxo MEI deve possuir RPC de entrada');
assert.match(app,/mei_end_hour/,'fluxo MEI deve possuir RPC de saida');
assert.match(guard,/data-start/,'guard deve proteger entrada');
assert.match(guard,/data-end/,'guard deve proteger saida');
assert.match(sw,/gestao-contratos-v13/,'service worker deve usar cache v13');

console.log('OK - verificacoes estruturais do fluxo MEI v13 passaram.');
