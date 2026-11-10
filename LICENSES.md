# Licenças: código, fontes e imagens

Conferido em 10/11/2026. Para refazer a lista de código: `npm run licenses`.

## Código (npm)
O site publicado (dependências de produção, 96 pacotes contando as indiretas) usa só licenças permissivas, sem obrigação de abrir o código da loja:
MIT (90), ISC (4), BSD-3-Clause (1), 0BSD (1).

| Pacote | Versão | Licença | Onde |
| --- | --- | --- | --- |
| react, react-dom | 18.3.1 | MIT | site |
| @supabase/supabase-js | 2.118.0 | MIT | site e servidor |
| express | 4.22.3 | MIT | servidor |
| pg | 8.23.1 | MIT | servidor |
| vite, @vitejs/plugin-react, vitest | 5.4.21 / 4.7.0 / 2.1.9 | MIT | só desenvolvimento |
| typescript | 5.9.3 | Apache-2.0 | só desenvolvimento |
| @electric-sql/pglite | 0.5.10 | Apache-2.0 | só testes |

Fora do que vai ao ar: `caniuse-lite` (CC-BY-4.0, usado só pelas ferramentas de build; nada dele é publicado).
O código do próprio projeto (`src/`, `server/`) foi escrito para a KYDSON. Não há trechos copiados de outros projetos.

## Fontes
- **Euro Sans Pro**: os arquivos `.woff2` **não estão no projeto**. Hoje o site usa a fonte do sistema do visitante. Antes de colocar os arquivos em `public/fonts/`, a loja precisa ter licença de uso **web** (webfont) da fonte, com o comprovante guardado.

## Imagens e ícones
- **Logotipo** (`public/brand/logo.png`): material da marca KYDSON. A loja deve confirmar que tem os direitos.
- **Fotos de produtos**: enviadas pelo painel. A loja é responsável por ter autorização (fotos próprias, do fornecedor/marca com permissão, ou licenciadas). Não use imagens copiadas de outros sites.
- **Ícone do WhatsApp**: o traçado do botão flutuante é o ícone comum do WhatsApp (compatível com o do Simple Icons, CC0), mas a origem exata não está registrada no projeto. O nome e o logo do WhatsApp são marcas da Meta; aqui servem só para indicar o canal de contato. Se quiser eliminar qualquer dúvida, troque por um ícone de licença conhecida ou use o texto "WhatsApp".
- **Ícone de favorito (coração)** e demais ícones: desenhados no projeto.
- **Instagram**: apenas um link para o perfil oficial. Nenhuma imagem ou script do Instagram é carregado.

## Terceiros carregados no navegador
Nenhum. O site não carrega fontes, scripts, imagens ou iframes de outros domínios (conferido no navegador).
Mercado Pago e WhatsApp só são abertos quando o cliente clica.
