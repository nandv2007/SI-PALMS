import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginForm } from './components/auth/LoginForm';
import { AppHeader } from './components/layout/AppHeader';
import { Sidebar } from './components/layout/Sidebar';
import { PoliceCategoryUploadView } from './components/views/PoliceCategoryUploadView';
import { InvestigatorCategoryUploadView } from './components/views/InvestigatorCategoryUploadView';
import { ForensicView } from './components/views/ForensicView';
import { LawyerView } from './components/views/LawyerView';
import { AccessRestricted } from './components/views/AccessRestricted';
import { CaseSelection } from './components/views/CaseSelection';

import { AuditTrailView } from './components/views/AuditTrailView';

const DashboardContent: React.FC = () => {
  const { user, activeCaseId, activeTab, canAccess } = useAuth();

  if (!user) {
    return <LoginForm />;
  }

  if (!activeCaseId) {
    return (
      <div className="min-h-screen flex flex-col">
        <AppHeader />
        <CaseSelection />
      </div>
    );
  }

  const renderActiveView = () => {
    if (!canAccess(activeTab)) {
      return <AccessRestricted />;
    }

    if (activeTab === 'police_audit_trail') {
      return <AuditTrailView />;
    }

    if (activeTab.startsWith('police_')) {
      return <PoliceCategoryUploadView />;
    }
    if (activeTab.startsWith('investigator_')) {
      return <InvestigatorCategoryUploadView />;
    }
    if (activeTab.startsWith('forensic_')) {
      return <ForensicView />;
    }
    if (activeTab.startsWith('lawyer_')) {
      return <LawyerView />;
    }

    return <PoliceCategoryUploadView />;
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 flex gap-6">
        <Sidebar />
        
        <main className="flex-1 min-w-0">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DashboardContent />
    </AuthProvider>
  );
}
