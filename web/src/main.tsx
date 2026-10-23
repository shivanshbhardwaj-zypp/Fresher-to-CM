import React from "react";
import ReactDOM from "react-dom/client";
import CmPage from "./CmPage";

/**
 * Single-page app: one campaign page, no router, no head manager.
 *
 * Nothing here needs react-router — the page has no internal navigation, and
 * its only links go to zypp.app or to an on-page anchor.
 *
 * Nothing needs react-helmet-async either: the meta tags are fixed and live in
 * index.html, where crawlers and link unfurlers can read them without running
 * this bundle.
 */
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CmPage />
  </React.StrictMode>,
);
