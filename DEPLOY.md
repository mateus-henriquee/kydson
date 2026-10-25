# Deploy da KYDSON na Vercel (com Supabase, Mercado Pago e WhatsApp)

Ordem: Supabase → Mercado Pago → WhatsApp → Vercel → testes.
Guarde cada chave em um bloco de notas; você vai colá-las na Vercel no passo 4.

## 1. Supabase (banco, login e fotos)
1. Crie conta em supabase.com → **New project** (região São Paulo). Anote a senha do banco.
2. **SQL Editor** → cole `supabase/migrations/0001_init.sql` → **Run**; depois `0002_calcados_perfis_config.sql` e `0003_modelo.sql`, um de cada vez → **Run**. (Tabelas, segurança, fotos, categoria Calçados, perfil Estoque, frete.) Ou, no seu PC: `npm run db:migrate`.
3. **Project Settings → API**: copie `Project URL` (→ `SUPABASE_URL` e `VITE_SUPABASE_URL`), `anon public` (→ `VITE_SUPABASE_ANON_KEY`) e `service_role` (→ `SUPABASE_SERVICE_ROLE_KEY`, **secreta**).
4. **Project Settings → Database → Connection string → Transaction pooler** (porta 6543): copie a URL, troque `[YOUR-PASSWORD]` pela senha (→ `DATABASE_URL`).
5. **Authentication → Providers → Email**: deixe ligado. Recomendado: manter "Confirm email" ligado.
6. **Authentication → URL Configuration**: em *Site URL* ponha o endereço do site (ex.: `https://kydson.vercel.app`) e em *Redirect URLs* adicione o mesmo endereço (usado nos e-mails de confirmação e "esqueci a senha").

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
