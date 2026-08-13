import "@testing-library/jest-dom/vitest";

import "../styles/global.css";

if (typeof HTMLDialogElement !== "undefined") {
  if (HTMLDialogElement.prototype.showModal === undefined) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
  }
  if (HTMLDialogElement.prototype.close === undefined) {
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
}
