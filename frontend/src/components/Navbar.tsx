/**
 * Top navigation bar. Shows different actions depending on auth state:
 * anonymous visitors can still browse/create/play tabs and use the tuner,
 * but only logged-in users see "My Tabs" / "Log out" (vs. "Log in").
 */
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <Link to="/" className="brand" style={{ textDecoration: "none" }}>
        🪕 Banjo Bonanza Jamboree (the Website)
      </Link>
      <nav>
        <Link to="/">Browse</Link>
        <Link to="/tabs/new">New Tab</Link>
        <Link to="/tuner">Tuner</Link>
        {user ? (
          <>
            <Link to={`/users/${user.username}`}>My Tabs ({user.username})</Link>
            <button className="secondary" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/register">Register</Link>
          </>
        )}
      </nav>
    </header>
  );
}
