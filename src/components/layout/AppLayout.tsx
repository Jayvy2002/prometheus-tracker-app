import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-black text-white">
      <ToastContainer />
      <main className="pb-24 max-w-lg mx-auto">
        <Outlet />
      </main>
      <FAB />
      <BottomNav />
    </div>
  );
}
