import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';
import SideNav from './SideNav';
import FAB from './FAB';
import { ToastContainer } from '../ui/Toast';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-black text-white flex">
      <ToastContainer />

      {/* Sidebar – desktop only */}
      <SideNav />

      {/* Main scrollable area */}
      <main className="flex-1 min-w-0 pb-24 md:pb-8 md:ml-64">
        <div className="max-w-3xl mx-auto w-full">
          <Outlet />
        </div>
      </main>

      {/* Mobile only */}
      <FAB />
      <BottomNav />
    </div>
  );
}
