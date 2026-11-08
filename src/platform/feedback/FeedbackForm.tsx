import React, {useState} from "react";
import "./Feedback.scss";
import {Link} from "../../utils/router";
import {MAX_COMMENT, sendFeedback} from "./sendFeedback";

const RATINGS = [1, 2, 3, 4, 5] as const;

/* "How was this tool?" under each tool, for signed-in people. Only the
   rating, the comment and the tool's name are sent, never files or results. */
export default function FeedbackForm({
  toolSlug,
  toolName
}: {
  toolSlug: string;
  toolName: string;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (rating === null && !comment.trim()) {
      setProblem("Choose a rating or write a comment first.");
      return;
    }
    setSending(true);
    setProblem(null);
    const error = await sendFeedback(toolSlug, rating, comment);
    setSending(false);
    if (error) {
      setProblem(error);
      return;
    }
    setSent(true);
    setRating(null);
    setComment("");
  };

  return (
    <section
      className="service-page-section feedback"
      aria-labelledby="feedback-title"
    >
      <h2 id="feedback-title">How was the {toolName}?</h2>
      {sent ? (
        <div className="tool-notice tool-notice-success" role="status">
          <p>Thank you! Your feedback was sent.</p>
          <button
            type="button"
            className="tool-button tool-button-quiet"
            onClick={() => setSent(false)}
          >
            Send more feedback
          </button>
        </div>
      ) : (
        <form className="feedback-form" onSubmit={submit} noValidate>
          <fieldset className="tool-group">
            <legend>How useful was it?</legend>
            <div className="feedback-scale">
              <div className="tool-choice">
                {RATINGS.map(value => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={rating === value}
                    aria-label={`${value} out of 5`}
                    onClick={() => setRating(rating === value ? null : value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <div className="feedback-scale-ends" aria-hidden="true">
                <span>Not useful</span>
                <span>Very useful</span>
              </div>
            </div>
          </fieldset>
          <label className="tool-field">
            <span className="tool-field-label">
              Anything else? (optional)
              <span className="tool-field-hint">
                Ideas, problems or features you'd like. Please don't paste
                personal details or your files' contents.
              </span>
            </span>
            <textarea
              className="tool-textarea feedback-comment"
              value={comment}
              maxLength={MAX_COMMENT}
              onChange={event => setComment(event.target.value)}
            />
            {comment.length > MAX_COMMENT - 200 && (
              <span className="tool-field-hint">
                {MAX_COMMENT - comment.length} characters left
              </span>
            )}
          </label>
          {problem && (
            <div className="tool-notice tool-notice-error" role="alert">
              <p>{problem}</p>
            </div>
          )}
          <div className="tool-actions-row">
            <button
              type="submit"
              className="tool-button tool-button-primary"
              disabled={sending}
            >
              {sending ? "Sending…" : "Send feedback"}
            </button>
            <span className="feedback-note">
              Sent with your account. <Link to="/privacy">Privacy policy</Link>
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
