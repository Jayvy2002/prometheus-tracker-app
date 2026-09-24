import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// French is the default and fallback: it ships in the main bundle. English is
// loaded on demand (its own chunk), so a French phone never downloads it.
import fr from './locales/fr';
import { setDisplayLanguage } from '../lib/utils';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
    },
    // English arrives later through addResourceBundle (ensureLanguage).
    partialBundledLanguages: true,
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
  // Numbers and clock times follow the app language, not the browser's.
  setDisplayLanguage(lang);
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

i18n.on('languageChanged', applyDocumentLang);
applyDocumentLang(i18n.language || 'fr');

let englishLoad: Promise<void> | null = null;

/**
 * Makes sure a language's texts are loaded before it is shown or used
 * (profile switch, coach questionnaire preview in English). French is always there.
 */
export function ensureLanguage(lang: string): Promise<void> {
  if (!lang.toLowerCase().startsWith('en') || i18n.hasResourceBundle('en', 'translation')) {
    return Promise.resolve();
  }
  englishLoad ??= import('./locales/en')
    .then(module => {
      i18n.addResourceBundle('en', 'translation', module.default, true, true);
    })
    .catch(error => {
      englishLoad = null;
      throw error;
    });
  return englishLoad;
}

/** Call this when the user changes their language in the profile. */
export function setAppLanguage(lang: string) {
  localStorage.setItem('prometheus_language', lang);
  // Switch only once the texts are there: never a screen of raw keys. If the
  // English chunk cannot load (offline first visit), the app stays in French.
  void ensureLanguage(lang)
    .then(() => i18n.changeLanguage(lang))
    .then(() => applyDocumentLang(lang))
    .catch(error => console.error('language load failed:', error));
}
