import { useState } from 'react';
import { Scale, BarChart2, CalendarDays } from 'lucide-react';
import WeightPage from '../weight/WeightPage';
import StatsPage from '../stats/StatsPage';
import CalendarPage from '../calendar/CalendarPage';

type Tab = 'weight' | 'stats' | 'calendar';

export default function ProgressPage() {
  const [activeTab, setActiveTab] = useState<Tab>('weight');

  const tabs: { id: Tab; label: string; icon: typeof Scale }[] = [
    { id: 'weight', label: 'Poids', icon: Scale },
    { id: 'stats', label: 'Stats', icon: BarChart2 },
    { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  ];

  return (
    <div className="pb-28 md:pb-8">
      {/* Tab switcher - sticky */}
      <div className="sticky top-0 z-10 bg-black/95 backdrop-blur-md px-4 pt-6 pb-3">
        <div className="flex gap-1 bg-neutral-900/80 rounded-xl p-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium transition-all ${
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

      {/* Tab content */}
      <div>
        {activeTab === 'weight' && <WeightPage embedded />}
        {activeTab === 'stats' && <StatsPage embedded />}
        {activeTab === 'calendar' && <CalendarPage embedded />}
      </div>
    </div>
  );
}
