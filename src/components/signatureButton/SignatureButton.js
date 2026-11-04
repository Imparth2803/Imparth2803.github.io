import React, {useContext} from "react";
import "./SignatureButton.scss";
import {contactInfo} from "../../portfolio";
import StyleContext from "../../contexts/StyleContext";

// "< Reach out to me />" mailto button in the header logo's signature font
export default function SignatureButton() {
  const {isDark} = useContext(StyleContext);
  if (!contactInfo.buttonText || !contactInfo.email_address) {
    return null;
  }
  return (
    <a
      className={isDark ? "signature-btn signature-btn-dark" : "signature-btn"}
      href={"mailto:" + contactInfo.email_address}
    >
      <span className="signature-bracket">&lt;</span>
      <span className="signature-text">{contactInfo.buttonText}</span>
      <span className="signature-bracket">/&gt;</span>
    </a>
  );
}
