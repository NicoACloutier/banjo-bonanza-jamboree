/**
 * Search bar for browsing published tabs by song name. Results are always
 * sorted by vote count server-side (see `TabsApi.search`).
 */
import { useState, type FormEvent } from "react";

interface SearchBarProps {
  initialQuery?: string;
  onSearch: (query: string) => void;
}

export function SearchBar({ initialQuery = "", onSearch }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(query.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="toolbar" role="search">
      <label style={{ flex: 1 }}>
        Search by song name
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Cripple Creek"
        />
      </label>
      <button type="submit">Search</button>
    </form>
  );
}
