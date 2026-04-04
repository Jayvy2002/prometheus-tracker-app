import { useState } from 'react';
import { User, Target, Ruler, Lock, LogOut, ChevronDown, Activity, MessageSquare, Bell, Trash2, Crown, Zap, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { usePaywallStore } from '../../stores/paywallStore';
import { supabase } from '../../lib/supabase';
import { toast } from '../ui/Toast';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import PageTransition from '../ui/PageTransition';
import PersonalInfoForm from './PersonalInfoForm';
import GoalsForm from './GoalsForm';
import UnitsForm from './UnitsForm';
import PasswordForm from './PasswordForm';
import FeedbackForm from './FeedbackForm';
import AvatarUpload from './AvatarUpload';
import NotificationSettings from './NotificationSettings';

type Section = 'personal' | 'goals' | 'units' | 'password' | 'feedback' | 'notifications';

interface AccordionSectionProps {
  id: Section;
  icon: React.ElementType;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  animationDelay: string;
}

function AccordionSection({ icon: Icon, label, isOpen, onToggle, children, animationDelay }: AccordionSectionProps) {
  return (
    <div className="animate-fade-in-up" style={{ animationDelay }}>
      <Card className="overflow-hidden !p-0">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
            <Icon size={16} />
          </div>
          <span className="flex-1 text-sm font-medium text-white">{label}</span>
          <ChevronDown
            size={16}
            className={`text-neutral-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {isOpen && (
          <div className="border-t border-neutral-800/60 px-4 py-4">
            {children}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { signOut, deleteAccount, user } = useAuthStore();
  const { profile } = useProfileStore();
  const { tier, status, currentPeriodEnd, cancelAtPeriodEnd } = useSubscriptionStore();
  const { openPaywall } = usePaywallStore();
  const isPremium = tier === 'premium' && (status === 'active' || status === 'trialing');
  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const openBillingPortal = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPortalLoading(false); return; }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-portal-session`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        toast('Impossible d\'ouvrir le portail de facturation. Réessaie.', 'error');
      }
    } catch {
      toast('Erreur réseau. Réessaie.', 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccount();
    if (error) {
      setDeleteError(error);
      setDeleting(false);
    }
    // On success, the auth store clears user/session and the app redirects automatically
  };

  const toggle = (section: Section) => {
    setOpenSection(prev => prev === section ? null : section);
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-white mb-6">Profile</h1>

      <Card className="mb-6 animate-fade-in-scale">
        <div className="flex items-center gap-4">
          <AvatarUpload />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-white truncate">{profile?.full_name || 'User'}</p>
            <p className="text-sm text-neutral-400 truncate">{user?.email}</p>
            <p className="text-xs text-neutral-500 mt-0.5">Tap photo to change</p>
          </div>
        </div>
      </Card>

      {/* Subscription card */}
      {isPremium ? (
        <div className="mb-4 animate-fade-in-scale">
          <Card className="!p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Crown size={16} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">Premium</p>
                <p className="text-xs text-neutral-500 truncate">
                  {cancelAtPeriodEnd && currentPeriodEnd
                    ? `Se termine le ${new Date(currentPeriodEnd).toLocaleDateString('fr-FR')}`
                    : currentPeriodEnd
                      ? `Renouvellement le ${new Date(currentPeriodEnd).toLocaleDateString('fr-FR')}`
                      : 'Actif'}
                </p>
              </div>
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-300 transition-colors disabled:opacity-60"
              >
                <ExternalLink size={11} />
                {portalLoading ? '...' : 'Gérer'}
              </button>
            </div>
          </Card>
        </div>
      ) : (
        <button
          onClick={() => openPaywall('Premium', 'Débloquez toutes les fonctionnalités de Prometheus.')}
          className="w-full mb-4 animate-fade-in-scale"
        >
          <Card className="!p-0 overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/8 to-transparent px-4 py-3 flex items-center gap-3 hover:from-amber-500/15 transition-all">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Crown size={16} className="text-amber-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold text-white">Passer à Premium</p>
                <p className="text-xs text-neutral-500">Débloquer toutes les fonctionnalités</p>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-semibold">
                <Zap size={11} fill="currentColor" />
                Upgrade
              </div>
            </div>
          </Card>
        </button>
      )}

      <div className="space-y-2 mb-6">
        <AccordionSection id="personal" icon={User} label="Personal Information" isOpen={openSection === 'personal'} onToggle={() => toggle('personal')} animationDelay="60ms">
          <PersonalInfoForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="goals" icon={Target} label="Goals & Targets" isOpen={openSection === 'goals'} onToggle={() => toggle('goals')} animationDelay="120ms">
          <GoalsForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="units" icon={Ruler} label="Units & Preferences" isOpen={openSection === 'units'} onToggle={() => toggle('units')} animationDelay="180ms">
          <UnitsForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="password" icon={Lock} label="Change Password" isOpen={openSection === 'password'} onToggle={() => toggle('password')} animationDelay="240ms">
          <PasswordForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="notifications" icon={Bell} label="Notifications & Reminders" isOpen={openSection === 'notifications'} onToggle={() => toggle('notifications')} animationDelay="300ms">
          <NotificationSettings />
        </AccordionSection>

        <AccordionSection id="feedback" icon={MessageSquare} label="Suggestion / Report a Problem" isOpen={openSection === 'feedback'} onToggle={() => toggle('feedback')} animationDelay="360ms">
          <FeedbackForm />
        </AccordionSection>

        <div className="animate-fade-in-up" style={{ animationDelay: '360ms' }}>
        <Card onClick={() => navigate('/routines')} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
            <Activity size={16} />
          </div>
          <span className="flex-1 text-sm font-medium text-white">Routines</span>
          <ChevronDown size={16} className="text-neutral-600 -rotate-90" />
        </Card>
        </div>

      </div>

      <Button variant="danger" onClick={handleSignOut} className="w-full animate-fade-in-up stagger-7">
        <LogOut size={16} /> Sign Out
      </Button>

      <button
        onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
        className="w-full mt-3 text-xs text-neutral-600 hover:text-rose-500 transition-colors animate-fade-in-up"
      >
        Delete my account
      </button>

      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Account">
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">
            This will permanently delete your account and all your data — workouts, nutrition logs, weight history. <span className="text-rose-400 font-medium">This action cannot be undone.</span>
          </p>
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">
              Type <span className="font-mono text-white">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
          {deleteError && (
            <p className="text-xs text-rose-400">{deleteError}</p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowDeleteModal(false)} className="flex-1" disabled={deleting}>
              Cancel
            </Button>
            <Button
              onClick={handleDeleteAccount}
              className="flex-1 !bg-rose-600 hover:!bg-rose-700"
              disabled={deleteConfirmText !== 'DELETE' || deleting}
            >
              <Trash2 size={14} />
              {deleting ? 'Deleting…' : 'Delete Account'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
