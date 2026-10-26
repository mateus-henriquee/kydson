export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const STAFF_ROLES = ["staff", "owner"]; // pedidos, clientes, painel completo de vendas
export const PANEL_ROLES = ["stock", "staff", "owner"]; // quem entra no painel (stock = só produtos e estoque)

/**
 * Login é do Supabase Auth: o navegador entra e recebe um token; a API só confere esse token.
 * `provider.getUser(token)` → { id, email, name } | null   (veja providers.js)
 */
export function createAuth({ db, provider }) {
  const bearer = (req) => {
    const h = req.headers.authorization;
    return typeof h === "string" && h.startsWith("Bearer ") ? h.slice(7).trim() : null;
  };

  async function load(req) {
    const token = bearer(req);
    if (!token) throw new HttpError(401, "Faça login para continuar.");
    let u;
    try {
      u = await provider.getUser(token);
    } catch {
      throw new HttpError(503, "Não foi possível verificar o login agora. Tente de novo.");
    }
    if (!u) throw new HttpError(401, "Sessão expirada. Entre novamente.");
    // Primeiro acesso = perfil de cliente. Papel (colaborador/dono) nunca é alterado aqui.
    const { rows } = await db.query(
      `insert into profiles (id, email, name) values ($1, $2, $3)
       on conflict (id) do update set email = excluded.email
       returning id, email, name, phone, cpf, address, role, active`,
      [u.id, u.email ?? "", u.name ?? ""],
    );
    const p = rows[0];
    if (!p.active) throw new HttpError(403, "Esta conta está desativada.");
    return p;
  }

  const wrap = (fn) => async (req, _res, next) => {
    try {
      req.user = await load(req);
      fn?.(req);
      next();
    } catch (e) {
      next(e);
    }
  };

  return {
    /** Qualquer pessoa logada (cliente, colaborador ou dono). */
    user: wrap(),
    staff: wrap((req) => {
      if (!STAFF_ROLES.includes(req.user.role)) throw new HttpError(403, "Acesso restrito a colaboradores.");
    }),
    /** Qualquer perfil do painel (inclui "Estoque"). */
    panel: wrap((req) => {
      if (!PANEL_ROLES.includes(req.user.role)) throw new HttpError(403, "Acesso restrito a colaboradores.");
    }),
    owner: wrap((req) => {
      if (req.user.role !== "owner") throw new HttpError(403, "Apenas o proprietário pode fazer isso.");
    }),
  };
}
