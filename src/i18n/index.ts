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
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    detection: {
      // Priority: localStorage (user's explicit choice) → navigator language
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'prometheus_language',
    },
    interpolation: {
      escapeValue: false, // React already escapes
    },
  });

export default i18n;

/** Call this when the user changes their language in the profile. */
export function setAppLanguage(lang: string) {
  i18n.changeLanguage(lang);
  localStorage.setItem('prometheus_language', lang);
}
