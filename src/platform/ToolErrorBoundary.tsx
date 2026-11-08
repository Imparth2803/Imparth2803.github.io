import React from "react";
import {track} from "../shared/usage";

interface State {
  failed: boolean;
}

/* Keeps a crash inside one tool from taking down the page: the rest of the
   site keeps working and the person gets a plain way forward. */
export default class ToolErrorBoundary extends React.Component<
  {children: React.ReactNode},
  State
> {
  override state: State = {failed: false};

  static getDerivedStateFromError(): State {
    return {failed: true};
  }

  override componentDidCatch(error: unknown) {
    console.error(error);
    track("crash");
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="tool-notice tool-notice-error" role="alert">
        <p>
          This tool ran into a problem and had to stop. Your files were not sent
          anywhere. Reload the page to start again.
        </p>
        <button
          type="button"
          className="tool-button"
          onClick={() => window.location.reload()}
        >
          Reload the page
        </button>
      </div>
    );
  }
}
