import { useEffect, useState } from "react";

const KEY = "listara:current-city";

export type CurrentCity = {
  id: string;
  name: string;
  stateCode: string;
  stateSlug: string;
  citySlug: string;
};

function read(): CurrentCity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CurrentCity) : null;
  } catch {
    return null;
  }
}

export function setCurrentCity(city: CurrentCity) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(city));
  window.dispatchEvent(new CustomEvent("listara:city-changed"));
}

export function useCurrentCity() {
  const [city, setCity] = useState<CurrentCity | null>(null);
  useEffect(() => {
    setCity(read());
    const onChange = () => setCity(read());
    window.addEventListener("listara:city-changed", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("listara:city-changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  return city;
}