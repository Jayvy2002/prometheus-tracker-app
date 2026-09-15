import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import AssignedQuestionnaireProvider from './components/onboarding/AssignedQuestionnaireProvider';
import { usePageTitle } from './hooks/usePageTitle';
import AppRoutes from './app/router/AppRoutes';

function TitleManager() {
  usePageTitle();
  return null;
}

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <TitleManager />
      <AssignedQuestionnaireProvider>
        <AppRoutes />
      </AssignedQuestionnaireProvider>
    </BrowserRouter>
  );
}
