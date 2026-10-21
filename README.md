# KYDSON — Site + painel + loja online

Stack: Vite + React 18 + TypeScript (site e painel) · Node + Express (API) · **Supabase** (Postgres, login, fotos) · **Mercado Pago** (pagamento) · **WhatsApp Cloud API** (aviso à loja) · deploy na **Vercel**.

Deploy passo a passo: veja [DEPLOY.md](DEPLOY.md). Variáveis: [.env.example](.env.example).

## Como funciona
1. Cliente monta o carrinho e clica em **Finalizar compra**. Sem conta, é levado a **criar conta / entrar**.
2. Informa nome, telefone e endereço. O servidor recalcula o preço no banco, **reserva o estoque por 30 min** e abre o Mercado Pago.
3. Ao pagar, o Mercado Pago avisa o servidor (webhook). O pedido vira **Pago**, aparece no painel (e entra no faturamento) e a loja recebe um **WhatsApp automático** com cliente, telefone, valor, produtos, horário e endereço.
4. Ícone dourado do WhatsApp fixo no canto inferior direito abre a conversa com a loja.

## Rodar localmente
Node 20.6+ e um projeto Supabase (veja DEPLOY.md, passo 1).
```bash
npm install
cp .env.example .env     # preencha DATABASE_URL, SUPABASE_*, VITE_*
npm run db:migrate       # cria as tabelas
npm run user:add -- --name "Seu Nome" --email voce@loja.com --password "senha-forte-123" --role owner
npm run dev              # site em http://localhost:5173 e painel em /painel
```
Pagamento e WhatsApp só funcionam com `MP_*` e `WHATSAPP_*` preenchidos (sem eles, o checkout avisa que está indisponível).

## Comandos
```bash
npm run build       # typecheck + build (dist/)
npm test            # vitest (site) + testes da API (banco em memória, serviços simulados)
npm run typecheck
```

## Painel (`/painel`)
Só entra quem tem função Colaborador ou Proprietário. Clientes não acessam.

| Tela | O que faz |
|---|---|
| Dashboard | faturamento, pedidos, ticket médio, comparativos, mais vendidos |
| Produtos e Estoque | cadastro, preço/promoção, destaque, lançamento, fotos (até 4 MB), cores, estoque por variação |
| Pedidos | pedidos do site (entram sozinhos, com cliente, endereço e status do WhatsApp, reenvio e conferência) e pedidos manuais |
| Equipe (proprietário) | promover cliente a colaborador, criar acessos, trocar função, redefinir senha, desativar |

## Segurança
- Login pelo Supabase Auth; a API valida o token a cada chamada.
- Tabelas com RLS ligado e sem políticas públicas: o acesso é só pela API.
- Preço sempre do banco; valor pago é conferido contra o pedido; webhook com assinatura e idempotente.
- Limite de 3 pedidos pendentes por cliente; reservas expiradas devolvem o estoque.
- Chaves secretas só no servidor (Vercel); apenas `VITE_*` vão ao navegador.

## Site público

| O quê | Onde |
|---|---|
| WhatsApp da loja (ícone fixo e "Combinar pelo WhatsApp") | `VITE_WHATSAPP_NUMBER=5511999999999` (DDI+DDD+número). Sem ele, o ícone não aparece |
| Catálogo | Vem do painel via `GET /api/catalog`; só produtos **ativos**. Atualiza sozinho |
| Páginas | `/` · `/catalogo` · `/catalogo/relogios`, `/perfumes`, `/acessorios`, `/outros` · `/produto/:id` · `/entrar` · `/conta` · `/finalizar` · `/pedido/:id` |
| Sinalizadores | Ordem: Lançamento / Destaque / Esgotado. Esgotado: foto P&B, sem compra |
| Logo / fonte | `public/brand/logo.png` · `public/fonts/EuroSansPro-*.woff2` (licença sua) |
| Cores | tokens no topo de `src/styles.css` (preto, creme, dourado `#B8935A`) |
| Abertura animada | frames em `public/frames/`; ajustes em `src/config/intro.ts` |

## Pendências suas
- Criar projeto Supabase, app no Mercado Pago e app/modelo no WhatsApp Cloud API (DEPLOY.md).
- Fonte Euro Sans Pro: colocar os `.woff2` em `public/fonts/`.
