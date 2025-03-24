import React from "react";
import ReactDOM from "react-dom";
import { LanguageProvider } from "./context/UIContext";

ReactDOM.render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
  document.getElementById("root"),
);
