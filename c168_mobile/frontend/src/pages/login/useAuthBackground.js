import { useEffect } from "react";

/** Login page: blue grid background on body.bg */
export function useAuthBackground() {
  useEffect(() => {
    document.body.classList.add("bg");
    return () => {
      document.body.classList.remove("bg");
    };
  }, []);
}
