/**
 * Thumbs-up-only vote button. Anonymous users see the count but a disabled
 * button prompting login (no down-votes exist anywhere in this app).
 */
import { useAuth } from "../hooks/useAuth";

interface VoteButtonProps {
  voteCount: number;
  hasVoted: boolean;
  onVote: () => void;
  disabled?: boolean;
}

export function VoteButton({ voteCount, hasVoted, onVote, disabled }: VoteButtonProps) {
  const { user } = useAuth();

  if (!user) {
    return (
      <span className="muted-text" title="Log in to vote">
        👍 {voteCount} (log in to vote)
      </span>
    );
  }

  return (
    <button onClick={onVote} disabled={disabled} className={hasVoted ? "" : "secondary"}>
      👍 {voteCount}
    </button>
  );
}
