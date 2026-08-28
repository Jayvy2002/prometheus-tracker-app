import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';
import { useCoachingStore } from '../../stores/coachingStore';
import CoachCommandPalette from '../coaching/CoachCommandPalette';

export default function AppLayout() {
  const coachingRole = useCoachingStore(s => s.coachingRole);
  const isCoach = coachingRole === 'coach';

  return (
    <div className="min-h-screen bg-black text-white flex">
      <ToastContainer />
      <CoachCommandPalette />

      <SideNav />

      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        <div className={`mx-auto w-full ${isCoach ? 'max-w-6xl' : 'max-w-3xl'}`}>
          <Outlet />
        </div>
      </main>

      {!isCoach && <FAB />}
      <BottomNav />
    </div>
  );
}
