/**
 * Application shell: routing table. Browsing, playback, the tuner and the
 * chord finder work without logging in; creating/editing tabs, voting and
 * the library need an account (enforced by the backend and reflected in the
 * UI).
 */
import { Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { VerifyEmailBanner } from "./components/VerifyEmailBanner";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { ChordsPage } from "./pages/ChordsPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { TabEditorPage } from "./pages/TabEditorPage";
import { TabViewPage } from "./pages/TabViewPage";
import { TunerPage } from "./pages/TunerPage";
import { UserProfilePage } from "./pages/UserProfilePage";
import { VerifyEmailPage } from "./pages/VerifyEmailPage";

export default function App() {
  const online = useOnlineStatus();
  return (
    <div className="app-shell">
      <Navbar />
      <VerifyEmailBanner />
      {!online && (
        <p className="offline-banner" role="status">
          You're offline. Tabs you've opened before still work; saving and searching
          need a connection.
        </p>
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tabs/new" element={<TabEditorPage />} />
        <Route path="/tabs/:tabId" element={<TabViewPage />} />
        <Route path="/tabs/:tabId/edit" element={<TabEditorPage />} />
        <Route path="/users/:username" element={<UserProfilePage />} />
        <Route path="/tuner" element={<TunerPage />} />
        <Route path="/chords" element={<ChordsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
      </Routes>
    </div>
  );
}
