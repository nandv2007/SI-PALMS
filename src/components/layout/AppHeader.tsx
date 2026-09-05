import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ROLE_CONFIGS } from '../../data/mockUsers';
import { Shield, LogOut, FolderKanban, ChevronRight, UserCheck } from 'lucide-react';

export const AppHeader: React.FC = () => {
  const { user, activeCaseId, setActiveCaseId, openAssignedCase, logout } = useAuth();

  if (!user) return null;

  const roleCfg = ROLE_CONFIGS[user.prefix];

  return (
    <header className="bg-slate-900 text-white sticky top-0 z-30 border-b border-slate-800 px-6 py-3 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        
        {/* Brand & Active Case Identifier */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-black text-white tracking-wider">SI-PALMS</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-950 text-cyan-300 border border-blue-800">
                  PORTAL
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-purple-950 text-purple-300 border border-purple-800 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                  BLOCKCHAIN SYNCED
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Police Asset & Cryptographic Evidence System</p>
            </div>
          </div>

          {/* Active Case Workspace Bar */}
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-slate-800 border border-slate-700 shadow-inner">
            <FolderKanban className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <div className="text-[9px] font-mono uppercase text-slate-400 font-bold">PORTAL CASES: {user.assignedCaseIds.length}</div>
              <div className="text-xs font-bold text-cyan-300 font-mono flex items-center gap-2">
                <span>{activeCaseId || 'No Case Selected'}</span>
                {user.prefix !== 'FO' && user.assignedCaseIds.length > 0 && (
                  <select
                    value={activeCaseId || ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        openAssignedCase(e.target.value);
                      } else {
                        setActiveCaseId('');
                      }
                    }}
                    className="bg-slate-950 text-xs font-mono text-cyan-200 px-2 py-0.5 rounded-lg border border-slate-700 cursor-pointer focus:outline-none"
                  >
                    <option value="">Switch case...</option>
                    {user.assignedCaseIds.map(cId => (
                      <option key={cId} value={cId}>{cId}</option>
                    ))}
                  </select>
                )}
                {activeCaseId && (
                  <button
                    onClick={() => setActiveCaseId('')}
                    className="text-[10px] bg-slate-900 hover:bg-slate-700 text-slate-200 px-2.5 py-0.5 rounded-lg border border-slate-700 cursor-pointer transition-colors font-sans font-semibold flex items-center gap-1"
                    title="Return to case selection dashboard"
                  >
                    Dashboard <ChevronRight className="w-3 h-3 text-cyan-400" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Authenticated Officer Badge & Logout */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-3 bg-slate-800 px-3.5 py-1.5 rounded-xl border border-slate-700">
            <UserCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <div className="text-right">
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs font-bold text-white">{user.name}</span>
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${roleCfg.badgeColor}`}>
                  {user.id}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {user.rankTitle} • <span className="text-cyan-400 font-bold">{user.station}</span>
              </div>
            </div>

            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-rose-900/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 transition-all cursor-pointer flex items-center gap-1 text-xs font-semibold"
              title="Logout session"
            >
              <LogOut className="w-3.5 h-3.5" /> Logout
            </button>
          </div>
        </div>

      </div>
    </header>
  );
};
