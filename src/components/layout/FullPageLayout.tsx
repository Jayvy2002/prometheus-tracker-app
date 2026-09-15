import { type ReactNode } from 'react';
import SideNav from './SideNav';
import { ToastContainer } from '../ui/Toast';

interface FullPageLayoutProps {
  children: ReactNode;
}

/**
 * Wrapper for full-page routes that live outside AppLayout
 * (WorkoutForm, ScannerPage). Recipes live in AppLayout / Nutrition.
 * On desktop it adds the sidebar + a centered content container.
 */
export default function FullPageLayout({ children }: FullPageLayoutProps) {
  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar on desktop */}
      <SideNav />

      {/* Content */}
      <main className="flex-1 min-w-0 pb-8 md:ml-64">
        <div className="max-w-3xl mx-auto w-full">
          {children}
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}
