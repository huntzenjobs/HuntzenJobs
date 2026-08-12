"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

const CONSENT_KEY = "huntzen_cookie_consent";
const CONSENT_EVENT = "huntzen:cookie-consent";
const GTM_ID = "GTM-N9VT3999";

type ConsentStatus = "accepted" | "declined";

export function GoogleTagManager() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(localStorage.getItem(CONSENT_KEY) === "accepted");

    const handleConsent = (event: Event) => {
      const consentEvent = event as CustomEvent<ConsentStatus>;
      setEnabled(consentEvent.detail === "accepted");
    };

    window.addEventListener(CONSENT_EVENT, handleConsent);
    return () => window.removeEventListener(CONSENT_EVENT, handleConsent);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <Script id="google-tag-manager" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          className="hidden invisible"
          title="Google Tag Manager"
        />
      </noscript>
    </>
  );
}
