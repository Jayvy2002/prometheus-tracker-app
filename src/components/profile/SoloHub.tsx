import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, ChefHat, Inbox, Search } from 'lucide-react';
import Card from '../ui/Card';

/** Rare personal tools that are not daily tabs. Marketplace stays discreet. */
export default function SoloHub() {
  const { t } = useTranslation();
  const links = [
    { path: '/recipes', icon: ChefHat, label: t('nav.recipes') },
    { path: '/photos', icon: Camera, label: t('nav.photos') },
    { path: '/coaches', icon: Search, label: t('marketplace.directory') },
    { path: '/coaching-requests', icon: Inbox, label: t('marketplace.requests') },
  ];
  return (
    <Card className="mb-6 space-y-1">
      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest px-1 mb-2">{t('profile.soloHubTitle')}</p>
      {links.map(link => (
        <Link
          key={link.path}
          to={link.path}
          className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white"
        >
          <link.icon size={16} className="text-blue-400" /> {link.label}
        </Link>
      ))}
    </Card>
  );
}
