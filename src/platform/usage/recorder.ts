/* Collects usage records for the tool page that's open and sends them to the
   usage_events table (supabase/migrations/003_usage_events.sql).

   Records are kept in memory and sent together when the person leaves the
   tool, switches to another tab or signs out (or every 50 records), never
   while a tool is working. Each value is checked again here: only numbers,
   true/false and short lowercase words (no dots or spaces, so no file
   names) get through. The database enforces the same rule. */

import {useEffect} from "react";
import {
  filesType,
  lengthBand,
  setUsageSink,
  sizeBand,
  track,
  UsageDetails
} from "../../shared/usage";
import {sendBeforeLeaving} from "../auth/session";

const OPT_OUT_KEY = "office-tools-usage";
const MAX_QUEUE = 50;
const MAX_DETAILS = 12;

/** Whether usage is recorded in this browser (on unless turned off). */
export function usageRecordingOn(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setUsageRecording(on: boolean): void {
  try {
    if (on) localStorage.removeItem(OPT_OUT_KEY);
    else localStorage.setItem(OPT_OUT_KEY, "off");
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

interface UsageRow {
  page_session: string;
  tool: string;
  action: string;
  details: UsageDetails;
  occurred_at: string;
}

let queue: UsageRow[] = [];

/** Sends any records waiting to go. */
export function flushUsage(): void {
  if (queue.length === 0) return;
  const rows = queue;
  queue = [];
  sendBeforeLeaving("usage_events", rows);
}

function cleanDetails(details: UsageDetails): UsageDetails {
  const clean: UsageDetails = {};
  for (const [key, value] of Object.entries(details).slice(0, MAX_DETAILS)) {
    if (!/^[a-z_]{1,32}$/.test(key)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) {
        clean[key] = Math.round(Math.min(Math.max(value, -1e9), 1e9));
      }
    } else if (typeof value === "boolean") {
      clean[key] = value;
    } else if (/^[a-z0-9_]{1,32}$/.test(value)) {
      clean[key] = value;
    }
  }
  return clean;
}

function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(
    16,
    20
  )}-${h.slice(20)}`;
}

/* Only events inside the tool itself count (not the feedback form). */
function inTool(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".tool, .editor") !== null;
}

function filesAdded(files: File[], via: "picker" | "drop") {
  if (files.length === 0) return;
  track("files_added", {
    count: files.length,
    type: filesType(files),
    size: sizeBand(files.reduce((sum, file) => sum + file.size, 0)),
    via
  });
}

/** Records usage of `tool` while its page is open and the person is signed
    in (and hasn't turned recording off in this browser). */
export function useUsageRecording(tool: string, signedIn: boolean): void {
  useEffect(() => {
    if (!signedIn || !usageRecordingOn()) return;
    const pageSession = randomId();
    setUsageSink((action, details) => {
      if (!/^[a-z_]{1,40}$/.test(action)) return;
      queue.push({
        page_session: pageSession,
        tool,
        action,
        details: cleanDetails(details),
        occurred_at: new Date().toISOString()
      });
      if (queue.length >= MAX_QUEUE) flushUsage();
    });
    track("open");

    // Captured on the way down, before a tool's own handler clears the input.
    const onChange = (event: Event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === "file") {
        if (inTool(input)) filesAdded(Array.from(input.files ?? []), "picker");
      }
    };
    const onDrop = (event: DragEvent) => {
      if (inTool(event.target)) {
        filesAdded(Array.from(event.dataTransfer?.files ?? []), "drop");
      }
    };
    const onPaste = (event: ClipboardEvent) => {
      if (!inTool(event.target)) return;
      // Only the length is kept, never the text.
      const length = event.clipboardData?.getData("text/plain").length ?? 0;
      if (length > 0) track("text_pasted", {length: lengthBand(length)});
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushUsage();
    };

    window.addEventListener("change", onChange, true);
    window.addEventListener("drop", onDrop, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flushUsage);
    return () => {
      window.removeEventListener("change", onChange, true);
      window.removeEventListener("drop", onDrop, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flushUsage);
      flushUsage();
      setUsageSink(null);
    };
  }, [tool, signedIn]);
}
