"use client";

import { useEffect } from "react";

export function SwRegister() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline shell is a nice-to-have; never break the app over it */
      });
    }
  }, []);
  return null;
}
