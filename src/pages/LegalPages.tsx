import { useEffect, type ReactNode } from "react";
import { STORE } from "../config/store";
import { INACTIVITY_MONTHS, LEGAL, TERMS_DATE_LABEL, TERMS_VERSION } from "../config/legal";
import { Link } from "../lib/router";
import { normalizePhone } from "../lib/whatsapp";
import { openCookieSettings } from "../lib/consent";

function useTitle(t: string) {
  useEffect(() => {
    const old = document.title;
    document.title = t;
    return () => {
      document.title = old;
    };
  }, [t]);
}

/** Como falar com a loja: e-mail (se informado no .env) e/ou WhatsApp. */
function Contact() {
  const wa = normalizePhone(STORE.whatsappNumber);
  return (
    <>
      {LEGAL.email && (
        <>
          E-mail: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          {wa ? " · " : ""}
        </>
      )}
      {wa && (
        <>
          WhatsApp: <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">pelo botão do site (abre em nova aba)</a>
        </>
      )}
      {!LEGAL.email && !wa && "pelos canais de atendimento informados no site."}
    </>
  );
}

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="page page--doc" aria-labelledby={id}>
      <p className="kicker">KYDSON</p>
      <h1 id={id} className="page__title-sm">
        {title}
      </h1>
      <p className="doc__meta">
        Versão {TERMS_VERSION} · atualizada em {TERMS_DATE_LABEL}
      </p>
      <div className="doc">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  useTitle("Política de Privacidade — KYDSON");
  return (
    <Doc id="priv-title" title="Política de Privacidade">
      <p>
        Esta política explica quais dados pessoais a KYDSON coleta no site, para quê, com quem compartilha e como você exerce seus direitos, conforme a Lei Geral de Proteção de Dados (LGPD, Lei 13.709/2018).
      </p>

      <h2>1. Quem é o responsável</h2>
      <p>
        A responsável pelo tratamento dos dados é a loja <strong>{STORE.name}</strong>
        {LEGAL.name && <> ({LEGAL.name})</>}
        {LEGAL.cnpj && <>, CNPJ {LEGAL.cnpj}</>}. Para assuntos de privacidade: <Contact />
      </p>

      <h2>2. Quais dados coletamos e por quê</h2>
      <p>Coletamos só o necessário para cada etapa.</p>
      <ul>
        <li>
          <strong>Para criar a conta:</strong> nome, e-mail e senha. A senha é guardada de forma protegida pelo serviço de login; a loja não consegue ver a sua senha.
        </li>
        <li>
          <strong>Para comprar:</strong> telefone, CPF e endereço de entrega (CEP, rua, número, complemento, bairro, cidade e estado). Usamos para identificar o comprador no pedido, entregar e falar com você sobre a entrega. Esses dados só são exigidos na hora da compra.
        </li>
        <li>
          <strong>Do pedido:</strong> produtos, valores, frete, datas, situação do pedido e o código do pagamento. Os dados do cartão são digitados no Mercado Pago e <strong>não passam pela loja</strong>.
        </li>
        <li>
          <strong>Favoritos:</strong> a lista (até 20) de produtos que você salvou, para você encontrá-los depois.
        </li>
        <li>
          <strong>Registro de aceite:</strong> a versão dos termos que você aceitou, a data e a hora e a declaração de que tem 18 anos ou mais.
        </li>
        <li>
          <strong>E-mail de novidades:</strong> só se você marcar essa opção, que vem desmarcada. Você pode cancelar a qualquer momento.
        </li>
        <li>
          <strong>Dados técnicos:</strong> o provedor de hospedagem pode registrar endereço IP e dados do navegador nos registros de acesso, por segurança e funcionamento do site.
        </li>
      </ul>
      <p>Não coletamos dados de cartão, localização, nem usamos cookies de publicidade ou de análise de comportamento.</p>

      <h2>3. Bases legais</h2>
      <ul>
        <li>Execução do contrato de compra (conta, pedido, pagamento e entrega).</li>
        <li>Cumprimento de obrigações legais e regulatórias (por exemplo, registros de venda).</li>
        <li>Consentimento (aceite dos termos e e-mail de novidades), que você pode revogar.</li>
        <li>Exercício regular de direitos, inclusive em processos.</li>
      </ul>

      <h2>4. Com quem compartilhamos</h2>
      <p>Não vendemos seus dados. Eles são compartilhados apenas com quem precisa participar da compra:</p>
      <ul>
        <li>
          <strong>Supabase:</strong> banco de dados, login e armazenamento de imagens.
        </li>
        <li>
          <strong>Vercel:</strong> hospedagem do site.
        </li>
        <li>
          <strong>Mercado Pago:</strong> processa o pagamento e recebe os dados necessários para isso.
        </li>
        <li>
          <strong>WhatsApp (Meta):</strong> usado para avisar a loja de um pedido pago (nome, telefone, valor, produtos e endereço) e quando você escolhe falar com a loja pelo WhatsApp.
        </li>
        <li>
          <strong>Transportadora ou entregador</strong> (Correios, Uber Moto ou outro): recebem nome, telefone e endereço para entregar o pedido.
        </li>
      </ul>
      <p>Esses serviços podem processar dados em servidores fora do Brasil. Nesses casos, buscamos provedores que adotem proteção compatível com a LGPD.</p>

      <h2>5. Cookies e armazenamento no navegador</h2>
      <p>O site guarda no seu navegador apenas o necessário para funcionar:</p>
      <ul>
        <li>
          <strong>Sessão de login</strong> (essencial): mantém você conectado.
        </li>
        <li>
          <strong>Carrinho</strong> (essencial): guarda os itens escolhidos.
        </li>
        <li>
          <strong>Sua escolha sobre cookies</strong> (essencial): lembra se você aceitou ou recusou.
        </li>
      </ul>
      <p>
        Não há cookies ou rastreadores opcionais ativos hoje. Se algum dia forem usados, só serão ativados depois do seu aceite, e você poderá mudar de ideia em{" "}
        <button type="button" className="link" onClick={openCookieSettings}>
          Preferências de cookies
        </button>
        .
      </p>

      <h2>6. Por quanto tempo guardamos</h2>
      <ul>
        <li>
          Dados da conta e favoritos: enquanto a conta existir. Contas de clientes sem nenhum acesso por {INACTIVITY_MONTHS} meses são excluídas automaticamente. Para evitar, basta entrar no site de vez em quando. Você também pode pedir a exclusão antes.
        </li>
        <li>Pedidos e dados de entrega: mesmo depois de a conta ser excluída, pelo prazo exigido pela legislação fiscal e para a defesa de direitos em eventual disputa.</li>
        <li>Registro de aceite: enquanto a conta existir, como prova do consentimento.</li>
      </ul>

      <h2>7. Seus direitos</h2>
      <p>
        Você pode pedir: confirmação de que tratamos seus dados; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; informação sobre com quem compartilhamos; e revogação do consentimento. Em Minha conta você já pode ver e corrigir seus dados, ver seus pedidos e desligar o e-mail de novidades. Para os demais pedidos: <Contact /> Alguns dados podem ser mantidos quando a lei exigir. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).
      </p>

      <h2>8. Menores de 18 anos</h2>
      <p>
        Contas são para maiores de 18 anos. Uma pessoa menor só pode ter conta com o consentimento específico de pai, mãe ou responsável legal, que deve falar com a loja: <Contact /> Se identificarmos uma conta de menor sem esse consentimento, ela será excluída.
      </p>

      <h2>9. Segurança</h2>
      <p>
        O site usa conexão criptografada (HTTPS), o acesso ao banco de dados é restrito ao servidor da loja, e o painel interno tem perfis de acesso. Nenhum sistema é totalmente imune; em caso de incidente com risco relevante, avisaremos você e a ANPD conforme a lei.
      </p>

      <h2>10. Mudanças nesta política</h2>
      <p>
        Quando houver mudança relevante, a versão e a data no topo serão atualizadas e pediremos novo aceite na próxima compra. Veja também os <Link to="/termos">Termos de Uso</Link>.
      </p>
    </Doc>
  );
}

export function TermsPage() {
  useTitle("Termos de Uso — KYDSON");
  return (
    <Doc id="terms-title" title="Termos de Uso">
      <p>
        Ao criar uma conta ou comprar no site da {STORE.name}, você concorda com estes termos e com a <Link to="/privacidade">Política de Privacidade</Link>.
      </p>

      <h2>1. A loja</h2>
      <p>
        Este site é da loja <strong>{STORE.name}</strong>
        {LEGAL.name && <> ({LEGAL.name})</>}
        {LEGAL.cnpj && <>, CNPJ {LEGAL.cnpj}</>}, que vende relógios, perfumes, acessórios e calçados. Contato: <Contact />
      </p>

      <h2>2. Conta</h2>
      <ul>
        <li>Só maiores de 18 anos podem criar conta. Menores precisam do consentimento de pai, mãe ou responsável legal, que deve falar com a loja.</li>
        <li>Informe dados verdadeiros e mantenha-os atualizados. Guarde sua senha; você é responsável pelo que for feito na sua conta.</li>
        <li>Para pagar pelo site é preciso ter conta.</li>
      </ul>

      <h2>3. Produtos e preços</h2>
      <p>
        Os preços são em reais (R$) e valem na hora do pagamento, conferidos pelo servidor. Fotos e descrições buscam ser fiéis, mas a cor pode variar conforme a tela. O estoque é limitado: um produto pode esgotar antes da conclusão da compra.
      </p>

      <h2>4. Pedido e pagamento</h2>
      <ul>
        <li>Ao finalizar a compra, o estoque fica reservado por um tempo limitado para você pagar. Passado o prazo sem pagamento, o pedido é cancelado e o estoque volta à venda.</li>
        <li>O pagamento é feito no Mercado Pago, que tem suas próprias regras. O pedido só é confirmado depois da aprovação do pagamento.</li>
        <li>Você também pode comprar combinando pelo WhatsApp com a loja; nesse caso, o pedido é fechado por lá.</li>
      </ul>

      <h2>5. Entrega e frete</h2>
      <p>
        Entregamos em todo o Brasil. A logística (Correios, Uber Moto ou outra) é definida pela loja. O frete é mostrado no carrinho e no checkout antes do pagamento, e a loja pode oferecer frete grátis acima de um valor mínimo, também informado ali. Confira o endereço digitado: endereço errado pode atrasar ou impedir a entrega.
      </p>

      <h2>6. Cancelamento, arrependimento, troca e devolução</h2>
      <ul>
        <li>
          <strong>Pedido ainda não pago:</strong> você cancela quando quiser em <Link to="/pedidos">Meus pedidos</Link>.
        </li>
        <li>
          <strong>Pedido pago:</strong> peça o cancelamento pelo mesmo lugar (botão que abre o WhatsApp da loja) ou pelo contato acima.
        </li>
        <li>
          <strong>Direito de arrependimento:</strong> em compras feitas pela internet você pode desistir em até 7 dias corridos do recebimento do produto, conforme o art. 49 do Código de Defesa do Consumidor, com devolução dos valores pagos.
        </li>
        <li>
          <strong>Defeito:</strong> seguem os prazos e direitos do Código de Defesa do Consumidor. Fale com a loja para iniciar a troca ou o reparo.
        </li>
      </ul>

      <h2>7. Favoritos</h2>
      <p>Você pode salvar até 20 produtos favoritos. Salvar um produto não o reserva nem garante preço ou estoque.</p>

      <h2>8. Propriedade intelectual</h2>
      <p>
        A marca, o logotipo, os textos e as imagens do site pertencem à {STORE.name} ou são usados com autorização. É proibido copiar ou reutilizar esse material sem permissão.
      </p>

      <h2>9. Uso do site</h2>
      <p>Não use o site para fraude, para tentar acessar áreas restritas ou dados de outras pessoas, nem para sobrecarregar o serviço. Contas usadas assim podem ser suspensas.</p>

      <h2>10. Disponibilidade</h2>
      <p>Fazemos o possível para manter o site no ar, mas ele pode ficar indisponível por manutenção ou por falhas de terceiros (hospedagem, pagamento). Isso não afeta os direitos que a lei garante a você.</p>

      <h2>11. Mudanças</h2>
      <p>Podemos atualizar estes termos. A versão e a data ficam no topo, e pediremos novo aceite na próxima compra.</p>

      <h2>12. Lei aplicável</h2>
      <p>Valem as leis do Brasil. Em caso de conflito, você pode usar o foro do seu domicílio, conforme o Código de Defesa do Consumidor.</p>
    </Doc>
  );
}
