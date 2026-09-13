import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart2, CalendarDays, CalendarRange, Camera, ChefHat, Inbox, Scale, Search, TrendingUp } from 'lucide-react';
import Card from '../ui/Card';

/**
 * Solo « Plus » hub: the tracker surfaces that only live in the desktop sidebar become reachable
 * on mobile (docs/VISION.md point 3 — the solo is a complete product; décision (e) du 4 sept.).
 */
export default function SoloHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const links = [
    { path: '/programs', icon: CalendarRange, label: t('nav.myProgram') },
    { path: '/stats', icon: BarChart2, label: t('nav.stats') },
    { path: '/exercise-progress', icon: TrendingUp, label: t('nav.exerciseProgress') },
    { path: '/calendar', icon: CalendarDays, label: t('nav.calendar') },
    { path: '/weight', icon: Scale, label: t('nav.weight') },
    { path: '/recipes', icon: ChefHat, label: t('nav.recipes') },
    { path: '/photos', icon: Camera, label: t('nav.photos') },
    { path: '/coaches', icon: Search, label: t('marketplace.directory') },
    { path: '/coaching-requests', icon: Inbox, label: t('marketplace.requests') },
  ];
  return (
    <Card className="mb-6 space-y-1">
      <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest px-1 mb-2">{t('profile.soloHubTitle')}</p>
      {links.map(link => (
        <button
          key={link.path}
          type="button"
          onClick={() => navigate(link.path)}
          className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white"
        >
          <link.icon size={16} className="text-blue-400" /> {link.label}
        </button>
      ))}
    </Card>
  );
}
