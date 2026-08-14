/**
 * Application shell: routing table. Most routes are accessible without
 * authentication (browsing, playback, tab creation, tuner); only drafting
 * and voting require a logged-in user (enforced by the backend and
 * reflected contextually in the UI).
 */
import { Route, Routes } from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { GoogleCallbackPage } from "./pages/GoogleCallbackPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { TabEditorPage } from "./pages/TabEditorPage";
import { TabViewPage } from "./pages/TabViewPage";
import { TunerPage } from "./pages/TunerPage";
import { UserProfilePage } from "./pages/UserProfilePage";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tabs/new" element={<TabEditorPage />} />
        <Route path="/tabs/:tabId" element={<TabViewPage />} />
        <Route path="/tabs/:tabId/edit" element={<TabEditorPage />} />
        <Route path="/users/:username" element={<UserProfilePage />} />
        <Route path="/tuner" element={<TunerPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
      </Routes>
    </div>
  );
}
