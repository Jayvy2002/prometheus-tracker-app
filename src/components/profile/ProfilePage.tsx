import { useState } from 'react';
import { User, Target, Ruler, Lock, LogOut, ChevronDown, Activity, Heart, BarChart2, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useProfileStore } from '../../stores/profileStore';
import Card from '../ui/Card';
import Button from '../ui/Button';
import PageTransition from '../ui/PageTransition';
import PersonalInfoForm from './PersonalInfoForm';
import GoalsForm from './GoalsForm';
import UnitsForm from './UnitsForm';
import PasswordForm from './PasswordForm';
import FeedbackForm from './FeedbackForm';
import AvatarUpload from './AvatarUpload';

type Section = 'personal' | 'goals' | 'units' | 'password' | 'feedback';

interface AccordionSectionProps {
  id: Section;
  icon: React.ElementType;
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  animationDelay: string;
}

function AccordionSection({ id: _id, icon: Icon, label, isOpen, onToggle, children, animationDelay }: AccordionSectionProps) {
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
  const { signOut, user } = useAuthStore();
  const { profile } = useProfileStore();
  const [openSection, setOpenSection] = useState<Section | null>(null);

  const handleSignOut = async () => {
    await signOut();
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

        <AccordionSection id="feedback" icon={MessageSquare} label="Suggestion / Report a Problem" isOpen={openSection === 'feedback'} onToggle={() => toggle('feedback')} animationDelay="300ms">
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

        <div className="animate-fade-in-up" style={{ animationDelay: '420ms' }}>
        <Card onClick={() => navigate('/health')} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
            <Heart size={16} />
          </div>
          <span className="flex-1 text-sm font-medium text-white">Health Integrations</span>
          <ChevronDown size={16} className="text-neutral-600 -rotate-90" />
        </Card>
        </div>

        <div className="animate-fade-in-up" style={{ animationDelay: '480ms' }}>
        <Card onClick={() => navigate('/stats')} className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
            <BarChart2 size={16} />
          </div>
          <span className="flex-1 text-sm font-medium text-white">Statistics</span>
          <ChevronDown size={16} className="text-neutral-600 -rotate-90" />
        </Card>
        </div>
      </div>

      <Button variant="danger" onClick={handleSignOut} className="w-full animate-fade-in-up stagger-7">
        <LogOut size={16} /> Sign Out
      </Button>
    </div>
    </PageTransition>
  );
}
