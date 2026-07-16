import { useState } from 'react';
import { Scale, BarChart2, CalendarDays } from 'lucide-react';
import WeightPage from '../weight/WeightPage';
import StatsPage from '../stats/StatsPage';
import CalendarPage from '../calendar/CalendarPage';
import PageTransition from '../ui/PageTransition';

type Tab = 'weight' | 'stats' | 'calendar';

export default function ProgressPage() {
  const [activeTab, setActiveTab] = useState<Tab>('weight');

  const tabs: { id: Tab; label: string; icon: typeof Scale }[] = [
    { id: 'weight', label: 'Poids', icon: Scale },
    { id: 'stats', label: 'Stats', icon: BarChart2 },
    { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  ];

  return (
    <PageTransition>
      <div className="px-4 pt-6">
        {/* Tab switcher */}
        <div className="flex gap-1 bg-neutral-900/80 rounded-xl p-1 mb-4 animate-fade-in-down">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-neutral-800 text-white shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-300'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content - rendered without the default headers */}
      <div className="-mt-6">
        {activeTab === 'weight' && <WeightPage />}
        {activeTab === 'stats' && <StatsPage />}
        {activeTab === 'calendar' && <CalendarPage />}
      </div>
    </PageTransition>
  );
}
