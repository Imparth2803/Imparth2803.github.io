import React from "react";
import ReactDOM from "react-dom";
import App from "./App";

// A plain function, not jest.fn(): CRA resets mock implementations before
// each test, which would make matchMedia return undefined.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});

// jsdom has no scrolling; Main scrolls to the top after each page change.
window.scrollTo = () => {};

it("renders without crashing", () => {
  const div = document.createElement("div");
  ReactDOM.render(<App />, div);
  ReactDOM.unmountComponentAtNode(div);
});
