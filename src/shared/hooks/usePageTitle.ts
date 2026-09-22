import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

const TITLE_RULES: Array<{ test: (path: string) => boolean; key: string }> = [
  { test: path => path.startsWith('/dashboard'), key: 'pages.today' },
  { test: path => path.startsWith('/workout'), key: 'pages.workout' },
  { test: path => path.startsWith('/nutrition') || path.startsWith('/scanner') || path.startsWith('/recipes'), key: 'pages.nutrition' },
  { test: path => path.startsWith('/exercise-progress') || path.startsWith('/stats') || path.startsWith('/weight') || path.startsWith('/calendar') || path.startsWith('/photos'), key: 'pages.progress' },
  { test: path => path.startsWith('/coach/import'), key: 'pages.import' },
  { test: path => path.startsWith('/profile') || path.startsWith('/coach/profile'), key: 'pages.profile' },
  { test: path => path.startsWith('/messages'), key: 'pages.messages' },
  { test: path => path.startsWith('/clients'), key: 'pages.clients' },
  { test: path => path.startsWith('/programs') || path.startsWith('/routines'), key: 'pages.programs' },
  { test: path => path.startsWith('/prometheus') || path.startsWith('/ask'), key: 'pages.prometheus' },
  { test: path => path.startsWith('/checkin'), key: 'pages.checkin' },
  { test: path => path.startsWith('/coaches') || path.startsWith('/coaching-requests'), key: 'pages.marketplace' },
];

export function usePageTitle(override?: string) {
  const { t } = useTranslation();
  const location = useLocation();

  useEffect(() => {
    const match = TITLE_RULES.find(rule => rule.test(location.pathname));
    const page = override ?? (match ? t(match.key) : 'Prometheus');
    document.title = page === 'Prometheus' ? 'Prometheus' : `${page} — Prometheus`;
  }, [location.pathname, override, t]);
}
