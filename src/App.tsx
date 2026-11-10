import { AuthProvider } from "./state/AuthContext";
import { ToastProvider } from "./state/ToastContext";
import { CartProvider } from "./state/CartContext";
import { CatalogProvider } from "./state/CatalogContext";
import { useScrollProgress } from "./hooks/useScrollProgress";
import { Header } from "./components/Header";
import { Intro } from "./components/Intro";
import { Showcase } from "./components/Showcase";
import { Collections } from "./components/Collections";
import { Featured } from "./components/Featured";
import { Instagram } from "./components/Instagram";
import { FinalCta } from "./components/FinalCta";
import { Footer } from "./components/Footer";
import { CartDrawer } from "./components/CartDrawer";
import { CatalogPage } from "./components/CatalogPage";
import { ProductPage } from "./components/ProductPage";
import { AuthPage } from "./pages/AuthPage";
import { AccountPage } from "./pages/AccountPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrderPage } from "./pages/OrderPage";
import { OrdersPage } from "./pages/OrdersPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { PrivacyPage, TermsPage } from "./pages/LegalPages";
import { UnsubscribePage } from "./pages/UnsubscribePage";
import { CookieBanner } from "./components/CookieBanner";
import { FavoritesProvider } from "./state/FavoritesContext";
import { NotFoundPage } from "./pages/NotFoundPage";
import { WhatsAppFab } from "./components/WhatsAppFab";
import { parseRoute, usePathname } from "./lib/router";

/** Fundo fixo que acompanha o scroll via --p (CSS). */
function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <svg viewBox="0 0 800 800" preserveAspectRatio="xMidYMid slice">
        <circle className="bd bd--a" cx="400" cy="400" r="300" />
        <circle className="bd bd--b" cx="400" cy="400" r="210" />
        <line className="bd bd--c" x1="400" y1="0" x2="400" y2="800" />
        <line className="bd bd--d" x1="0" y1="400" x2="800" y2="400" />
      </svg>
    </div>
  );
}

export default function App() {
  useScrollProgress();
  const route = parseRoute(usePathname());
  return (
    <ToastProvider>
    <AuthProvider>
    <CatalogProvider>
      <FavoritesProvider>
      <CartProvider>
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Backdrop />
      <Header />
      <main id="conteudo">
        {route.name === "home" && (
          <>
            <Intro />
            <Showcase />
            <Collections />
            <Featured pick="featured" kicker="Destaques" title="Em destaque" />
            <Featured pick="launch" kicker="Novidades" title="Lançamentos" />
            <Instagram />
            <FinalCta />
          </>
        )}
        {route.name === "catalog" && <CatalogPage category={route.category} />}
        {route.name === "product" && <ProductPage id={route.id} />}
        {route.name === "login" && <AuthPage />}
        {route.name === "account" && <AccountPage />}
        {route.name === "checkout" && <CheckoutPage />}
        {route.name === "order" && <OrderPage id={route.id} />}
        {route.name === "orders" && <OrdersPage />}
        {route.name === "favorites" && <FavoritesPage />}
        {route.name === "privacy" && <PrivacyPage />}
        {route.name === "terms" && <TermsPage />}
        {route.name === "unsubscribe" && <UnsubscribePage />}
        {route.name === "notfound" && <NotFoundPage />}
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppFab />
      <CookieBanner />
      </CartProvider>
      </FavoritesProvider>
    </CatalogProvider>
    </AuthProvider>
    </ToastProvider>
  );
}
