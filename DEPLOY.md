# Deploy da KYDSON na Vercel (com Supabase, Mercado Pago e WhatsApp)

Ordem: Supabase → Mercado Pago → WhatsApp → Vercel → testes.
Guarde cada chave em um bloco de notas; você vai colá-las na Vercel no passo 4.

## 1. Supabase (banco, login e fotos)
1. Crie conta em supabase.com → **New project** (região São Paulo). Anote a senha do banco.
2. **SQL Editor** → cole `supabase/migrations/0001_init.sql` → **Run**; depois `0002_calcados_perfis_config.sql`, `0003_modelo.sql`, `0004_cpf_envio.sql`, `0005_privacidade_favoritos.sql`, `0006_ultimo_acesso.sql` e `0007_aviso_exclusao.sql`, um de cada vez → **Run**. (Tabelas, segurança, fotos, categoria Calçados, perfil Estoque, frete.) Ou, no seu PC: `npm run db:migrate`.
3. **Project Settings → API**: copie `Project URL` (→ `SUPABASE_URL` e `VITE_SUPABASE_URL`), `anon public` (→ `VITE_SUPABASE_ANON_KEY`) e `service_role` (→ `SUPABASE_SERVICE_ROLE_KEY`, **secreta**).
4. **Project Settings → Database → Connection string → Transaction pooler** (porta 6543): copie a URL, troque `[YOUR-PASSWORD]` pela senha (→ `DATABASE_URL`).
5. **Authentication → Providers → Email**: deixe ligado. Recomendado: manter "Confirm email" ligado.
6. **Authentication → Email Templates**: cole o conteúdo de `supabase/email-templates/` (confirmar-cadastro → *Confirm signup*, recuperar-senha → *Reset password*, alterar-email → *Change email address*). Todos já têm o link de descadastro e o link da Política de Privacidade.
7. **Authentication → URL Configuration**: em *Site URL* ponha o endereço do site (ex.: `https://kydson.vercel.app`) e em *Redirect URLs* adicione **`https://kydson.vercel.app/entrar`** e **`https://kydson.vercel.app/**`** (troque pelo seu endereço). Sem isso o link do e-mail "esqueci a senha" cai na página inicial em vez do formulário de nova senha. (O site também redireciona para o formulário se o link cair em outra página, mas a lista de Redirect URLs deve estar correta.)

## 2. Mercado Pago (pagamento)
1. mercadopago.com.br/developers → **Suas integrações → Criar aplicação** (Checkout Pro).
2. **Credenciais de produção**: copie o `Access Token` (→ `MP_ACCESS_TOKEN`). Para testar antes, use as credenciais de teste.
3. **Webhooks** (depois do deploy, passo 5): URL `https://SEU-SITE/api/payments/webhook`, evento **Pagamentos**. Copie a **assinatura secreta** (→ `MP_WEBHOOK_SECRET`).

## 3. WhatsApp Cloud API (aviso para a loja)
1. developers.facebook.com → **Criar app** (tipo Empresa) → adicionar produto **WhatsApp**.
2. Em **WhatsApp → API Setup**: anote o `Phone number ID` (→ `WHATSAPP_PHONE_NUMBER_ID`). Gere um **token permanente** (Usuário do sistema no Business Manager, permissão `whatsapp_business_messaging`) (→ `WHATSAPP_TOKEN`).
3. O número que **recebe** o aviso é o da loja (→ `WHATSAPP_TO`, só dígitos com 55). Ele precisa ser **diferente** do número que envia pela API.
4. **Modelos de mensagem → Criar** (categoria *Utilidade*, idioma *Português (BR)*), nome `pedido_pago`, texto exato:
   `Novo pedido pago no site! Pedido nº {{1}}. Cliente: {{2}}. Telefone: {{3}}. Valor pago: {{4}}. Produtos: {{5}}. Pago em: {{6}}. Endereço de entrega: {{7}}.`
   Aguarde a aprovação. Nome do modelo → `WHATSAPP_TEMPLATE`; idioma → `WHATSAPP_TEMPLATE_LANG` (`pt_BR`).
5. Em modo de teste, a Meta exige que o número destino esteja na lista de destinatários do app.

## 4. GitHub → Vercel
1. O código já está no GitHub (`mateus-henriquee/kydson`).
2. vercel.com → **Add New → Project** → importe o repositório. Framework: **Vite** (detectado). Não mude build/output.
3. **Environment Variables** → adicione (Production):
   `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET=products`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TO`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WHATSAPP_NUMBER`.
   (`SITE_URL` só se usar domínio próprio.)
4. **Deploy**.
5. Com o endereço no ar, volte ao Mercado Pago (passo 2.3) e cadastre o webhook; coloque o segredo em `MP_WEBHOOK_SECRET`. Depois **Deployments → ⋯ → Redeploy** (variáveis só valem em novo deploy).

## 5. Criar o primeiro dono do painel
No seu computador, na pasta do projeto, com um arquivo `.env` contendo `DATABASE_URL`, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`:
```
npm install
npm run user:add -- --name "Seu Nome" --email voce@email.com --password "SenhaForte123" --role owner
```
Entre em `https://SEU-SITE/painel`. Outros colaboradores: aba **Equipe**.

## 6. Checklist de teste
- [ ] Site abre; ícone dourado do WhatsApp aparece no canto e abre a conversa.
- [ ] `/entrar` cria conta e (se ligado) chega o e-mail de confirmação.
- [ ] Sem login, "Finalizar compra" leva a `/entrar`.
- [ ] Compra de teste com credenciais de teste do Mercado Pago.
- [ ] Pedido vira **Pago** em `/pedido/N` e em `/painel/pedidos`, estoque baixa.
- [ ] Chega o WhatsApp na loja (nome, valor, produtos, horário, endereço). Se falhar, o painel mostra o erro e o botão **Reenviar WhatsApp**.
- [ ] Antes de vender de verdade: troque para credenciais de produção.

## Limites e cuidados
- Fotos: até 4 MB cada (limite da Vercel).
- Reserva de estoque: 30 min. Pagamento aprovado após expirar tenta reservar de novo; se não der, o pedido fica marcado para conferência no painel.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `MP_ACCESS_TOKEN` ou `WHATSAPP_TOKEN` com prefixo `VITE_`.

## Envio, CPF e frete grátis
- No checkout o cliente informa **CPF** e o endereço. Entrega para todo o Brasil. Uber Moto/Correios é logística da loja: o cliente não escolhe.
- **Frete grátis** acima de R$ 350,00 (só produtos; exatamente R$ 350,00 ainda paga frete). Mude em Painel → Configurações (0,00 desliga). O frete normal é um valor fixo.
- O CPF aparece em Painel → Pedidos. O aviso de WhatsApp da loja não mudou (mesmo modelo `pedido_pago`).
- Botão **Comprar pelo WhatsApp** (carrinho e checkout): abre a conversa com o pedido, frete e endereço. Não cria pedido no painel nem reserva estoque.


## Privacidade, termos e cookies (LGPD)
- Preencha na Vercel, antes de divulgar: `VITE_LEGAL_NAME`, `VITE_LEGAL_CNPJ` e `VITE_CONTACT_EMAIL`. O que ficar vazio não aparece nos textos; sem e-mail de contato, os pedidos de privacidade ficam só pelo WhatsApp.
- Os textos estão em `src/pages/LegalPages.tsx`. São um ponto de partida baseado no que o site realmente faz. **Peça a um advogado para revisar** antes de publicar, principalmente o item de CPF, os prazos de guarda e a política de troca.
- Ao mudar os textos, troque a versão em `src/config/legal.ts` **e** `server/legal.js` (o teste automático confere). Todos os clientes aceitam de novo na próxima compra.
- O aceite (versão, data/hora, origem) fica na tabela `consents`. Sem aceite válido o servidor recusa o checkout.
- Contas: checkbox "Tenho 18 anos ou mais" (declaração; o site não consegue verificar a idade). Menores só com consentimento do responsável, combinado com a loja.
- Cookies: o banner tem Aceitar e Recusar com o mesmo destaque. **Hoje não existe nenhum rastreador no site.** Se um dia adicionar análise/pixel, carregue **somente** dentro de `whenAnalyticsAllowed(() => { ... })` (`src/lib/consent.ts`), e atualize a Política de Privacidade.
- E-mails: o Supabase envia confirmação e senha; o servidor envia só o aviso de exclusão por inatividade (veja abaixo, via Resend). Para qualquer outro e-mail que enviar, use `emailFooter()` de `server/legal.js`: ele coloca o link de descadastro assinado e os cabeçalhos List-Unsubscribe, e recusa enviar se o segredo não existir. Defina `UNSUBSCRIBE_SECRET` na Vercel (um texto aleatório longo).
- Licenças de código, fontes e imagens: veja `LICENSES.md`.

## Evitar a pausa do Supabase (plano grátis)
- O Supabase pausa projetos grátis com pouca atividade no banco em 7 dias ([documentação](https://supabase.com/docs/guides/platform/free-project-pausing)). Ela diz que, em geral, algumas consultas por dia bastam.
- `vercel.json` chama `/api/catalog` (rota pública, só leitura do catálogo) **3 vezes por dia**: por volta de 08h, 12h e 18h de Brasília. Não precisa de variável nova. No Hobby, cada execução pode atrasar até cerca de 1 hora.
- **Não é garantia.** Se pausar mesmo assim: painel do Supabase → projeto → **Resume project**. Só o plano pago do Supabase impede a pausa por inatividade.
- Os agendamentos só rodam no deploy de produção. Confira em Vercel → projeto → configurações de Cron Jobs.
- Loja vendendo de verdade: o plano Hobby da Vercel é só para uso não comercial.

## Exclusão automática de contas inativas
- **Prazo: 24 meses sem acessar o site** (o mesmo da Política de Privacidade). Escolhi 24 porque a lei pede que não se guarde dado sem necessidade, mas o cliente de relógio/perfume compra poucas vezes por ano; 3 a 6 meses apagaria gente que ainda é cliente. O mínimo aceito pelo código é 6 meses.
- "Acesso" = a pessoa entrou no site logada (registrado em `profiles.last_seen_at`, no máximo 1 vez por dia). Quem já tinha conta começa com a data da migração `0006`, então **nada é excluído antes de 24 meses depois do deploy**.
- Só exclui **clientes**. Nunca dono, atendimento, estoque, contas desativadas pela loja, nem quem tem pedido aguardando pagamento. No máximo 50 por execução.
- **Os pedidos ficam** (obrigação legal): só deixam de apontar para a conta. Favoritos e registros de aceite saem junto.
- **Aviso por e-mail 30 dias antes:** quando a conta chega a 23 meses sem acesso, o site envia um e-mail dizendo a data da exclusão e como evitar (entrar no site). A exclusão só acontece se **(a)** passaram 24 meses sem acesso **e (b)** o aviso foi enviado há 30 dias ou mais. Se a pessoa entrar de novo, o aviso é zerado e a contagem recomeça. Se o e-mail falhar, o aviso é desfeito e tenta de novo no dia seguinte. **Sem e-mail configurado, nenhuma conta é excluída.**
- **Configurar o envio (Resend, plano grátis serve):** 1) crie conta em resend.com; 2) **Domains** → adicione o domínio da loja e crie no seu provedor de domínio os registros DNS que ele mostrar (SPF e DKIM); espere ficar "Verified"; 3) **API Keys** → crie uma chave; 4) na Vercel: `RESEND_API_KEY` = a chave e `MAIL_FROM` = `KYDSON <avisos@seudominio.com.br>` (o domínio precisa ser o verificado); 5) defina também `SITE_URL` (endereço do site) para os links do e-mail.
- **Rode a migração `0007` ANTES de publicar esta versão** (o login passa a usar a coluna nova; sem ela o site dá erro).
- **Automático:** `vercel.json` agenda **todo dia** (06:17 UTC). Para ativar, crie `CRON_SECRET` na Vercel (texto aleatório longo). Sem ele, a rota nem existe; sem Resend, ela responde 503 e não faz nada. No máximo 25 avisos e 50 exclusões por execução. Plano Hobby da Vercel permite 1 execução por dia: serve.
- **Manual:** `npm run cleanup` só mostra quantas contas seriam avisadas e excluídas (não faz nada). `npm run cleanup -- --apply` envia os avisos e exclui (precisa de `RESEND_API_KEY`, `MAIL_FROM` e `SITE_URL` no `.env`).
- **Limites honestos:** testado só com e-mail simulado, nunca com o Resend de verdade. O e-mail pode cair em spam se o domínio não estiver verificado. Cliente que mudou de e-mail sem atualizar a conta não recebe o aviso.
