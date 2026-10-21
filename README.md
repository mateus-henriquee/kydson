# KYDSON — Site + painel dos colaboradores

Stack: Vite + React 18 + TypeScript no front; Node + Express + SQLite (`node:sqlite`, embutido no Node) no painel.
Sem banco externo: os dados ficam em `data/kydson.db` e as fotos em `data/uploads/`.

## Executar

Pré-requisito: **Node 22.13 ou superior** (testado no 22 e no 24).

```bash
npm install
npm run user:add -- --name "Seu Nome" --email voce@loja.com --password "senha-forte-123" --role owner
npm run dev          # http://localhost:5173  (site)  e  /painel  (colaboradores)
```

Outros comandos:

```bash
npm run build        # build de produção (dist/)
npm start            # serve dist/ + API em produção
npm test             # testes do site (vitest) e da API (node:test)
```

## Painel dos colaboradores (`/painel`)

Só entra quem foi cadastrado. Não existe cadastro público.

| Tela | O que faz |
|---|---|
| Login | e-mail + senha; sessão de 8 h |
| Dashboard | faturamento, pedidos, ticket médio, mês atual × anterior, gráfico por mês, mais vendidos, tabela comparativa. Períodos: 7/30/90 dias, 6/12 meses, este ano ou datas livres |
| Produtos e Estoque | adicionar, editar e excluir; categoria Relógio, Perfume, Acessório ou Outros; preço, preço promocional, destaque, lançamento, ativo, fotos (setas para ordem), cores, estoque simples ou por tamanho/variação |
| Pedidos | registrar pedido (baixa o estoque), marcar como pago, cancelar (devolve ao estoque) |
| Equipe (só proprietário) | criar colaboradores, trocar função, redefinir senha, desativar |

Só pedidos **pagos** entram no faturamento, no mês da data do pagamento (fuso de São Paulo).

### Criar usuários
- Primeiro proprietário: `npm run user:add -- --name ... --email ... --password ... --role owner`
- Esqueceu a senha: `npm run user:add -- --email voce@loja.com --password "nova-senha-123" --reset`
- Demais pessoas: pela tela **Equipe**.

### Segurança implementada
- Senhas com scrypt + salt; nunca ficam em texto.
- Sessão em cookie `HttpOnly` + `SameSite=Lax`; o servidor guarda só o hash do token.
- Limite de 5 tentativas de login por e-mail/IP a cada 10 min; mensagem de erro genérica.
- Bloqueio de requisições de escrita vindas de outra origem (CSRF).
- Upload só de JPG/PNG/WebP, conferido pelo conteúdo do arquivo, até 6 MB.
- Todas as rotas da API, exceto login, exigem sessão; Equipe exige perfil proprietário.
- Desativar usuário ou trocar a senha derruba as sessões dele na hora.

### Para publicar de verdade (obrigatório)
1. Use **HTTPS** e defina `COOKIE_SECURE=true`.
2. Atrás de proxy (Nginx, Render, Railway…) defina `TRUST_PROXY=true`.
3. O servidor precisa de disco persistente para `data/` (ou defina `DB_PATH` e `UPLOADS_DIR`). Hospedagem estática pura (Netlify/Vercel só com `dist/`) **não** roda o painel.
4. Faça backup periódico de `data/`.
5. Não use as senhas de teste do README em produção.

Variáveis: `PORT`, `DB_PATH`, `UPLOADS_DIR`, `COOKIE_SECURE`, `TRUST_PROXY`, `VITE_WHATSAPP_NUMBER`.

## Site público

| O quê | Onde |
|---|---|
| WhatsApp oficial | `.env` → `VITE_WHATSAPP_NUMBER=5511999999999` (DDI+DDD+número) ou `src/config/store.ts` |
| Catálogo do site | Vem do painel (**Produtos e Estoque**) via `GET /api/catalog`; só produtos **ativos**. Sem produto cadastrado, a vitrine fica vazia. Atualiza sozinho (a cada 20 s, ao voltar para a aba e quando o painel salva) |
| Páginas | `/` início · `/catalogo` geral · `/catalogo/relogios`, `/perfumes`, `/acessorios`, `/outros` (com filtros de preço, cor, tamanho, destaque e promoção) · `/produto/:id` (galeria, cor, tamanho e recomendações) |
| Sinalizadores | **Promoção** (preço promocional): selo -%, preço em dourado. **Destaque**: moldura dourada, ocupa 2 colunas no catálogo. **Lançamento**: selo. **Esgotado** (estoque 0): foto em preto e branco, faixa "Esgotado", vai para o fim da lista, sem botão de compra |
| Cores e tamanhos | No formulário do produto: **Cores** (bolinha + nome) e **Estoque → por tamanho/variação** (ex.: 40/41/42, 50 ml). Os filtros só aparecem quando há dados |
| Logo | `public/brand/logo.png` |
| Fonte Euro Sans Pro | `public/fonts/EuroSansPro-Regular.woff2` e `EuroSansPro-Bold.woff2` (licença sua). Sem os arquivos usa a fonte instalada ou um fallback |
| Cores | tokens no topo de `src/styles.css`: preto `#000`, creme `#F8F0E3`, dourado `#B8935A` (amostrado da logo) |
| Abertura animada | frames em `public/frames/f_001.webp…f_085.webp`; quantidade, distância de rolagem e escurecimento em `src/config/intro.ts` |

Sem número de WhatsApp o carrinho mostra "configuração pendente" e não gera link.

## Limites desta versão
- Fotos: a 1ª é a principal, a 2ª aparece ao passar o mouse. Mude a ordem com as setas no formulário.
- Abrir o WhatsApp não confirma compra; não há pagamento online.
- Pedidos do site não entram sozinhos no painel: a equipe os registra em **Pedidos**.
- Sem recuperação de senha por e-mail (a redefinição é feita pelo proprietário ou pelo comando acima).
- Dourado amostrado da logo, não um valor oficial. O Instagram não foi acessível na criação.

## Próximos passos
1. Pedido do carrinho já gravado no painel como "aguardando pagamento".
2. Pagamento online (Pix/cartão), frete e rastreio.
3. Banco gerenciado (PostgreSQL) se o volume crescer.
