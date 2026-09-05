import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_CONFIGS } from '../../data/mockUsers';
import type { WorkspaceTab, RolePrefix } from '../../types/auth';
import { 
  PlusCircle, 
  Search, 
  Network, 
  Microscope, 
  Scale, 
  History,
  Lock,
  ShieldCheck
} from 'lucide-react';

interface TabItem {
  id: WorkspaceTab;
  label: string;
  rolePrefix: RolePrefix;
  icon: React.ElementType;
}

const ALL_TABS: TabItem[] = [
  // PO Tabs (Police Officer Only)
  { id: 'police_case_upload', label: 'Upload Case File Details', rolePrefix: 'PO', icon: PlusCircle },
  { id: 'police_audit_trail', label: 'Cryptographic Audit History', rolePrefix: 'PO', icon: History },

  // FO Tabs (Forensic Officer Only)
  { id: 'forensic_lab_upload', label: 'Upload Forensic Report', rolePrefix: 'FO', icon: Microscope },

  // IN Tabs (Investigator Only)
  { id: 'investigator_case_search', label: 'Search Case Files & Evidence', rolePrefix: 'IN', icon: Search },
  { id: 'investigator_graph', label: 'Evidence Relational Graph', rolePrefix: 'IN', icon: Network },

  // LW Tabs (Lawyer / Prosecutor Only - Read Only)
  { id: 'lawyer_read_vault', label: 'Read-Only Case Disclosure Vault', rolePrefix: 'LW', icon: Scale },
  { id: 'lawyer_audit_trail', label: 'Cryptographic Audit History', rolePrefix: 'LW', icon: History }
];

export const Sidebar: React.FC = () => {
  const { user, activeTab, setActiveTab } = useAuth();

  if (!user) return null;

  const currentRoleCfg = ROLE_CONFIGS[user.prefix];
  // Filter tabs so ONLY current officer's role tabs are displayed!
  const roleAccessibleTabs = ALL_TABS.filter(t => t.rolePrefix === user.prefix);

  return (
    <aside className="w-72 shrink-0 bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between h-[calc(100vh-6rem)] sticky top-20">
      
      <div className="space-y-6">
        
        {/* Active Officer Workspace Banner */}
        <div className={`p-4 rounded-2xl border ${currentRoleCfg.accentBorder} bg-slate-50 shadow-2xs space-y-2 relative overflow-hidden`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 font-bold">AUTHORIZED WORKSPACE</span>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${currentRoleCfg.badgeColor}`}>
              {user.prefix} PREFIX
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 leading-tight">{currentRoleCfg.title}</h3>
          <p className="text-[11px] text-slate-600 leading-normal font-mono">{currentRoleCfg.clearanceLevel}</p>
        </div>

        {/* Dynamic Nav Items strictly isolated to this Officer's Role */}
        <div className="space-y-2">
          <div className="text-[10px] font-mono font-bold text-slate-500 tracking-wider px-2 uppercase flex items-center justify-between">
            <span>{currentRoleCfg.prefix} WORKSPACE MODULES</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">{roleAccessibleTabs.length} MODULES</span>
          </div>

          {roleAccessibleTabs.map((tab) => {
            const isSelected = activeTab === tab.id;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 border border-blue-500'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-slate-500'}`} />
                  <span className="truncate">{tab.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Security Isolation Notice */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <Lock className="w-4 h-4 text-blue-600" /> Strict Role Isolation
          </div>
          <p className="text-[10px] leading-relaxed text-slate-500">
            Access privileges are restricted to your assigned Officer ID clearance level ({user.prefix}). Cross-role operations are cryptographically blocked.
          </p>
        </div>

      </div>

      {/* System Status Footer */}
      <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500">
        <span className="flex items-center gap-1 font-bold text-slate-700">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> RBAC Active
        </span>
        <span>Node: Local EVM</span>
      </div>

    </aside>
  );
};
