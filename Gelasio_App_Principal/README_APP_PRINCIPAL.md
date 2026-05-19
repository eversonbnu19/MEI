# Gelasio App Principal

Este pacote cria uma entrada unica para o Painel de Cestas:

- `Gelasio_App_Principal_Login.hta`: app principal com tela de login.
- `logo_empresa.png`: logo exibida no login e no menu lateral.
- `dados\gelasio_app_db.enc`: banco criptografado usado pelo login e pelos usuarios.
- `Gelasio_App_Principal_usuarios.json`: base em JSON para validacoes, testes e migracao local.

## Usuarios iniciais

| Usuario | Senha | Perfil |
| --- | --- | --- |
| admin | admin123 | Admin completo |
| jessica | 1234 | Movimentacao V1 |
| paula | 1234 | Movimentacao V2 |
| nathan | 1234 | Movimentacao V3 |
| expedicao | exp123 | Expedicao |
| financeiro | fin123 | Financeiro |

Troque as senhas antes de usar em producao.

## Logo

O arquivo `logo_empresa.png` ja esta com a logo oficial da empresa.
Se precisar trocar no futuro, substitua por outro PNG com o mesmo nome.

## Como usar com o painel atual

Coloque a pasta `Gelasio_App_Principal` ao lado da pasta `Gelasio_Painel_Cestas`.
O app tenta encontrar automaticamente:

- `dados\painel_cestas_data.json`
- `painel_cestas_status`
- os arquivos `.hta` antigos, quando existirem

Enquanto as telas antigas nao forem migradas para dentro do app unico, o login funciona como entrada principal e libera os modulos conforme o perfil.

## Banco de dados e usuarios

Depois do login com um usuario administrador, acesse `Configuracoes`.

- Aba `Banco de dados`: mostra a pasta `dados`, o arquivo `gelasio_app_db.enc`, status da criptografia e a migracao do JSON antigo quando ele existir localmente.
- Aba `Usuarios`: cria novos usuarios, altera senhas, define perfil e escolhe os modulos liberados.
- Aba `Perfil`: define os tipos de perfil e o checklist de acessos de cada um.

O app usa o banco criptografado em `dados\gelasio_app_db.enc`. O JSON de usuarios fica versionado para validacoes e testes, mas o login usa o banco criptografado quando ele existe.

Perfis padrao:

- Administrador
- Usuario V1
- Usuario V2
- Usuario V3
- Expedicao
- Financeiro

Acessos configuraveis por perfil:

- Painel Geral: geral ou por usuario conforme perfil
- Movimentacao
- Expedicao
- Financeiro
- Relatorios
- Configuracao

## Rolagem da tela

Depois do login, o menu lateral fica fixo e a area principal mostra barras de rolagem automaticamente quando o conteudo for maior que a tela.

## Proximo passo recomendado

Quando o ZIP original puder ser lido, o ideal e migrar o codigo repetido dos arquivos por usuario para dentro deste HTA unico, mantendo apenas:

1. um arquivo principal;
2. um cadastro de usuarios;
3. uma tabela de permissoes;
4. um arquivo de dados compartilhado.
