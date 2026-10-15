/**
 * Previous/next page controls with a "Page 2 of 5" label. Renders nothing
 * when everything fits on one page.
 */
interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1 && page <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pages">
      <button type="button" className="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        ← Previous
      </button>
      <span className="muted-text">
        Page {page} of {pageCount}
      </span>
      <button type="button" className="secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
        Next →
      </button>
    </nav>
  );
}

/** Empty-list message for a page past the end (e.g. from an old link). */
export function PastLastPage({ onFirstPage }: { onFirstPage: () => void }) {
  return (
    <>
      There's nothing on this page.{" "}
      <button type="button" className="link-button" onClick={onFirstPage}>
        Go to the first page
      </button>
    </>
  );
}
