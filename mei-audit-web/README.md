# MEI Contratos Auditáveis

PWA responsiva com Supabase para três perfis.

## Uso
- **MEI no celular:** registra entrada/saída por hora ou tipo de peça + lote + quantidade, acompanha valores e envia NF após fechamento.
- **Contratante no PC:** cria contratos, configura valores, fecha períodos, baixa NFs e encaminha para pagamento.
- **Auditor no PC:** consulta execuções, lotes, acessos, fechamentos e trilha de eventos.

## Backend
Projeto Supabase conectado pelo `config.js`. O banco usa RLS, Storage privado para NFs e funções RPC com horário do servidor para os registros operacionais.

## Contas
Novos cadastros entram como `mei`. Para transformar uma conta em Contratante ou Auditor, altere administrativamente o campo `role` da tabela `mei_profiles`.

Exemplo:
```sql
update public.mei_profiles set role='company' where email='empresa@exemplo.com';
update public.mei_profiles set role='auditor' where email='auditor@exemplo.com';
```

Para o Contratante, crie uma empresa e vincule o usuário em `mei_company_users`.

## Publicação no GitHub Pages
Há um workflow em `.github/workflows/mei-audit-pages.yml`. Após integrar esta branch, em **Settings > Pages**, selecione **GitHub Actions** como fonte.

## Auditoria
Os horários de entrada/saída, produção, fechamento e eventos relevantes são gravados pelo banco. User agent, plataforma e fuso são registrados na sessão. IP confiável exige captura em Edge Function/proxy de produção e não deve ser obtido diretamente do navegador.
