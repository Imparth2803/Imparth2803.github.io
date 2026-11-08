import {postToDatabase} from "../auth/session";

/* Saves one piece of feedback (supabase/migrations/002_feedback.sql).
   The database fills in who sent it and when. Returns a message for the
   person if it didn't work, or null. */

export const MAX_COMMENT = 2000;

export async function sendFeedback(
  tool: string,
  rating: number | null,
  comment: string
): Promise<string | null> {
  const text = comment.trim();
  try {
    const response = await postToDatabase("feedback", {
      tool,
      rating,
      comment: text || null
    });
    if (!response) return "Please sign in again to send feedback.";
    if (response.ok) return null;
    // The database's daily limit shows up as a row-level security refusal.
    const reply = await response.text();
    if (response.status === 403 && /row-level security/i.test(reply)) {
      return "You've sent a lot of feedback today. Thank you! Please send more tomorrow.";
    }
  } catch {
    // Offline or the request was blocked: fall through to the general message.
  }
  return "Your feedback couldn't be sent just now. Please try again.";
}
