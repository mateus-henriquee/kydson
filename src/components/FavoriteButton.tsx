import { useFavorites } from "../state/FavoritesContext";

/** Coração para salvar/remover dos favoritos. Sem login, leva para entrar. */
export function FavoriteButton({ id, name, className = "" }: { id: number; name: string; className?: string }) {
  const { has, toggle } = useFavorites();
  const on = has(id);
  return (
    <button
      type="button"
      className={`fav ${on ? "is-on" : ""} ${className}`}
      data-fav-id={id}
      aria-pressed={on}
      aria-label={`${on ? "Remover dos favoritos" : "Salvar nos favoritos"}: ${name}`}
      onClick={() => void toggle(id, name)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 6 5c2 0 3.4 1.1 4 2.4h4C14.6 6.1 16 5 18 5c3.4 0 5.1 3.4 3.6 6.8C19.5 16.4 12 21 12 21z" transform="translate(0 -.5)" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
