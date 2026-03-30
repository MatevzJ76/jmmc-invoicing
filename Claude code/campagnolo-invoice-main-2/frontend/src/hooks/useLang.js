import React, { createContext, useContext, useState } from 'react';
import { translations } from '../i18n/translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(
    localStorage.getItem('lang') || 'it'
  );

  function t(path) {
    const keys = path.split('.');
    let obj = translations[lang] || translations.it;
    for (const k of keys) {
      obj = obj?.[k];
      if (obj === undefined) break;
    }
    return obj || path;
  }

  function changeLang(l) {
    setLang(l);
    localStorage.setItem('lang', l);
  }

  return (
    <LangContext.Provider value={{ lang, t, changeLang }}>
      {children}
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);
