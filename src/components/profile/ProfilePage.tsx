import { useState, useEffect } from 'react';
import { User, Target, Ruler, Lock, LogOut, ChevronDown, Activity, MessageSquare, Bell, Trash2, Globe, Inbox, Bug, Lightbulb } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';

import { supabase } from '../../lib/supabase';
import { setAppLanguage } from '../../i18n';
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

type Section = 'personal' | 'goals' | 'units' | 'password' | 'feedback' | 'notifications' | 'language';

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

  const [openSection, setOpenSection] = useState<Section | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [feedbackItems, setFeedbackItems] = useState<{ id: string; type: string; title: string; description: string; created_at: string }[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!feedbackOpen) return;
    supabase
      .from('user_feedback')
      .select('id, type, title, description, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setFeedbackItems((data ?? []) as typeof feedbackItems));
  }, [feedbackOpen]);



  const handleLanguageChange = async (lang: string) => {
    setAppLanguage(lang);
    if (user) {
      await updateProfile(user.id, { language: lang });
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
  };

  const toggle = (section: Section) => {
    setOpenSection(prev => prev === section ? null : section);
  };

  return (
    <PageTransition>
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold text-white mb-6">{t('profile.title')}</h1>

      <Card className="mb-6 animate-fade-in-scale">
        <div className="flex items-center gap-4">
          <AvatarUpload />
          <div className="flex-1 min-w-0">
            <p className="text-lg font-semibold text-white truncate">{profile?.full_name || 'User'}</p>
            <p className="text-sm text-neutral-400 truncate">{user?.email}</p>
            <p className="text-xs text-neutral-500 mt-0.5">{t('profile.tapToChange')}</p>
          </div>
        </div>
      </Card>



      <div className="space-y-2 mb-6">
        <AccordionSection id="personal" icon={User} label={t('profile.sections.personalInfo')} isOpen={openSection === 'personal'} onToggle={() => toggle('personal')} animationDelay="60ms">
          <PersonalInfoForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

        <AccordionSection id="goals" icon={Target} label={t('profile.sections.goalsTargets')} isOpen={openSection === 'goals'} onToggle={() => toggle('goals')} animationDelay="120ms">
          <GoalsForm onBack={() => setOpenSection(null)} inline />
        </AccordionSection>

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

        <div className="animate-fade-in-up" style={{ animationDelay: '360ms' }}>
        <Card onClick={() => navigate('/routines')} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
            <Activity size={16} />
          </div>
          <span className="flex-1 text-sm font-medium text-white">{t('profile.sections.routines')}</span>
          <ChevronDown size={16} className="text-neutral-600 -rotate-90" />
        </Card>
        </div>

      </div>

      {/* Feedback inbox */}
      {(
        <div className="mb-4 animate-fade-in-scale">
          <Card className="!p-0 overflow-hidden">
            <button
              onClick={() => setFeedbackOpen(o => !o)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
                <Inbox size={16} className="text-indigo-400" />
              </div>
              <span className="flex-1 text-sm font-medium text-white">{t('profile.admin.feedbackInbox')}</span>
              <ChevronDown
                size={16}
                className={`text-neutral-500 transition-transform duration-200 ${feedbackOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {feedbackOpen && (
              <div className="border-t border-neutral-800/60 divide-y divide-neutral-800/40 max-h-96 overflow-y-auto">
                {feedbackItems.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-neutral-500 text-center">{t('profile.admin.noFeedback')}</p>
                ) : feedbackItems.map(item => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-0.5">
                      {item.type === 'bug' ? (
                        <Bug size={11} className="text-rose-400 shrink-0" />
                      ) : (
                        <Lightbulb size={11} className="text-amber-400 shrink-0" />
                      )}
                      <p className="text-xs font-medium text-white truncate">{item.title}</p>
                      <span className="ml-auto text-[10px] text-neutral-600 shrink-0">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-snug line-clamp-2">{item.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Button variant="danger" onClick={handleSignOut} className="w-full animate-fade-in-up stagger-7">
        <LogOut size={16} /> {t('profile.signOut')}
      </Button>

      <button
        onClick={() => { setShowDeleteModal(true); setDeleteConfirmText(''); setDeleteError(null); }}
        className="w-full mt-3 text-xs text-neutral-600 hover:text-rose-500 transition-colors animate-fade-in-up"
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
