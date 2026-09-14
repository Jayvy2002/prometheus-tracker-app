import { useState } from 'react';
import { User, Target, Ruler, Lock, LogOut, ChevronDown, MessageSquare, Bell, Trash2, Globe, Users, SlidersHorizontal, Camera, CalendarRange, Apple, Scale, ClipboardList, Inbox, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import { useCoachingStore } from '../../stores/coachingStore';
import { isIntakeAlreadyFilled } from '../../lib/kinesiologyIntake';
import { useAccountContext } from '../../lib/useAccountContext';
import { toast } from '../ui/Toast';
import { setAppLanguage } from '../../i18n';

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
import CoachSettingsPanel from '../coaching/CoachSettingsPanel';
import ClientCoachRelationshipPanel from '../coaching/ClientCoachRelationshipPanel';
import SoloHub from './SoloHub';

type Section = 'personal' | 'goals' | 'units' | 'password' | 'feedback' | 'notifications' | 'language' | 'coachPrefs';

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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signOut, deleteAccount, user } = useAuthStore();
  const { profile, updateProfile } = useProfileStore();
  const { myCoach, enableCoachMode, disableCoachMode, myTrackingConfig: tracking } = useCoachingStore();
  const context = useAccountContext();
  const inCoaching = context.activeWorkspace === 'coaching';
  const canCoach = context.capabilities.coach;
  const coached = context.personalCoaching === 'coached';

  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);







  const handleLanguageChange = async (lang: string) => {
    setAppLanguage(lang);
    if (user) {
      const result = await updateProfile(user.id, { language: lang });
      if (result.error) toast(result.error, 'error');
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
    } else {
      navigate('/auth');
    }
  };

  const toggle = (section: Section) => {
    setOpenSection(prev => prev === section ? null : section);
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-white mb-6">{t('profile.title')}</h1>

      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('profile.groups.profile')}</p>
      <Card className="mb-6 animate-fade-in-scale">
        <div className="flex items-center gap-4">
          <AvatarUpload />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-white truncate">{profile?.full_name || t('profile.fallbackName')}</p>
            <p className="text-sm text-neutral-400 truncate">{user?.email}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{t('profile.tapToChange')}</p>
            {myCoach && (
              <p className="text-xs text-blue-400 mt-1">{t('coaching.coachedBy', { name: myCoach.full_name })}</p>
            )}
          </div>
        </div>
      </Card>

      {(coached || inCoaching) && (
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('profile.groups.coaching')}</p>
      )}
      {coached && (
        <Card className="mb-6 space-y-1">
          <Link to="/photos" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
            <Camera size={16} className="text-blue-400" /> {t('nav.photos')}
          </Link>
          <Link to="/programs" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
            <CalendarRange size={16} className="text-blue-400" /> {t('nav.myProgram')}
          </Link>
          {tracking.track_nutrition && (
            <Link to="/nutrition" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
              <Apple size={16} className="text-blue-400" /> {t('nav.nutrition')}
            </Link>
          )}
          {tracking.track_weight && (
            <Link to="/weight" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
              <Scale size={16} className="text-blue-400" /> {t('nav.weight')}
            </Link>
          )}
          {!isIntakeAlreadyFilled(profile) && (
            <Link to="/intake" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
              <ClipboardList size={16} className="text-blue-400" /> {t('intake.completeLater')}
            </Link>
          )}
        </Card>
      )}

      {coached && myCoach && (
        <ClientCoachRelationshipPanel coachName={myCoach.full_name || t('coaching.invite.aCoach')} />
      )}

      {!coached && !inCoaching && (
        <div className="md:hidden">
          <SoloHub />
        </div>
      )}

      {inCoaching && (
        <Card className="mb-6 space-y-1 md:hidden">
          <Link to="/coach/profile" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
            <User size={16} className="text-blue-400" /> {t('marketplace.profile')}
          </Link>
          <Link to="/coaching-requests" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
            <Inbox size={16} className="text-blue-400" /> {t('marketplace.requests')}
          </Link>
          <Link to="/coaches" className="w-full flex items-center gap-3 px-1 py-2.5 text-left text-sm text-white">
            <Search size={16} className="text-blue-400" /> {t('marketplace.directory')}
          </Link>
        </Card>
      )}

      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('profile.groups.preferences')}</p>
      <div className="space-y-2 mb-6">
        <AccordionSection id="personal" icon={User} label={t('profile.sections.personalInfo')} isOpen={openSection === 'personal'} onToggle={() => toggle('personal')} animationDelay="60ms">
          <PersonalInfoForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        {inCoaching && (
        <AccordionSection id="coachPrefs" icon={SlidersHorizontal} label={t('coaching.settings.title')} isOpen={openSection === 'coachPrefs'} onToggle={() => toggle('coachPrefs')} animationDelay="90ms">
          <CoachSettingsPanel />
        </AccordionSection>
        )}

        {!inCoaching && (
        <AccordionSection id="goals" icon={Target} label={t('profile.sections.goalsTargets')} isOpen={openSection === 'goals'} onToggle={() => toggle('goals')} animationDelay="120ms">
          <GoalsForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>
        )}

        <AccordionSection id="units" icon={Ruler} label={t('profile.sections.units')} isOpen={openSection === 'units'} onToggle={() => toggle('units')} animationDelay="180ms">
          <UnitsForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="language" icon={Globe} label={t('profile.sections.language')} isOpen={openSection === 'language'} onToggle={() => toggle('language')} animationDelay="210ms">
          <div className="flex gap-2">
            {(['en', 'fr'] as const).map(lang => (
              <button
                key={lang}
                onClick={() => handleLanguageChange(lang)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border
                  ${i18n.language === lang
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-neutral-800 text-neutral-400 border-neutral-700 hover:border-neutral-600'}`}
              >
                {t(`profile.language.${lang}`)}
              </button>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection id="password" icon={Lock} label={t('profile.sections.changePassword')} isOpen={openSection === 'password'} onToggle={() => toggle('password')} animationDelay="240ms">
          <PasswordForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="notifications" icon={Bell} label={t('profile.sections.notifications')} isOpen={openSection === 'notifications'} onToggle={() => toggle('notifications')} animationDelay="300ms">
          <NotificationSettings />
        </AccordionSection>

        <AccordionSection id="feedback" icon={MessageSquare} label={t('profile.sections.feedback')} isOpen={openSection === 'feedback'} onToggle={() => toggle('feedback')} animationDelay="360ms">
          <FeedbackForm />
        </AccordionSection>

        {!coached && !inCoaching && (
        <Card className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
            <Users size={16} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">{t('coaching.coachMode')}</p>
            <p className="text-[11px] text-neutral-500">{t('coaching.coachModeHint')}</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const result = canCoach ? await disableCoachMode() : await enableCoachMode();
              if (result.error) toast(result.error, 'error');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
              canCoach ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-300'
            }`}
          >
            {canCoach ? t('common.on') : t('common.off')}
          </button>
        </Card>
        )}

      </div>



      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-2">{t('profile.groups.account')}</p>
      <Button variant="secondary" onClick={handleSignOut} className="w-full animate-fade-in-up stagger-7">
        <LogOut size={16} /> {t('profile.signOut')}
      </Button>

      <p className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mt-6 mb-2">{t('profile.groups.advanced')}</p>
      <button
        onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
        className="w-full min-h-11 text-sm text-neutral-500 hover:text-rose-500 transition-colors animate-fade-in-up"
      >
        {t('profile.deleteAccount')}
      </button>

      <Modal open={showDeleteModal} onClose={() => setShowDeleteModal(false)} title={t('profile.deleteModal.title')}>
        <div className="space-y-4">
          <p className="text-sm text-neutral-300">
            {t('profile.deleteModal.confirmText')} <span className="text-rose-400 font-medium">{t('common.cannotBeUndone')}</span>
          </p>
          <div>
            <label className="block text-xs text-neutral-500 mb-1.5">
              {t('profile.deleteModal.typeToConfirm')}
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
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleDeleteAccount}
              className="flex-1 !bg-rose-600 hover:!bg-rose-700"
              disabled={deleteConfirmText !== 'DELETE' || deleting}
            >
              <Trash2 size={14} />
              {deleting ? t('profile.deleteModal.deleting') : t('profile.deleteModal.title')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </PageTransition>
  );
}
