import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);

  return (
    <div className="min-h-screen bg-black text-white flex">
      <ToastContainer />

      <SideNav />

      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        <div className="max-w-3xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {coachingRole !== 'coach' && <FAB />}
      <BottomNav />
    </div>
  );
}
