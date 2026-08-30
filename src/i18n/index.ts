import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Translations are imported lazily to keep the bundle split clean.
// The actual locale files are populated by the i18n agent.
import en from './locales/en';
import fr from './locales/fr';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: 'fr',
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    detection: {
      // Explicit profile / picker only. Navigator English was mixing chrome
      // (Today / Clients / Programs) while drafts stayed French.
      order: ['localStorage'],
      caches: ['localStorage'],
      lookupLocalStorage: 'prometheus_language',
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
    // react-i18next v17 defaults to useSuspense: true. Without a boundary,
    // the first t() suspends forever and the static index.html splash never unmounts.
    react: {
      useSuspense: false,
    },
  });

export default i18n;

function applyDocumentLang(lang: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

i18n.on('languageChanged', applyDocumentLang);
applyDocumentLang(i18n.language || 'fr');

/** Call this when the user changes their language in the profile. */
export function setAppLanguage(lang: string) {
  i18n.changeLanguage(lang);
  localStorage.setItem('prometheus_language', lang);
  applyDocumentLang(lang);
}
