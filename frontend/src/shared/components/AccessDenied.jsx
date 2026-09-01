import { ShieldAlert, RefreshCw } from 'lucide-react'

export default function AccessDenied({ moduleLabel, onLogout, onRefresh }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-[60px] px-6 m-auto">
      <div className="w-[58px] h-[58px] rounded-full grid place-items-center mb-4 bg-gradient-to-br from-danger to-[#F97316] shadow-[0_12px_26px_var(--danger-soft)]">
        <ShieldAlert size={26} color="#fff" />
      </div>
      <h2 className="text-lg font-extrabold text-text-primary m-0">Access restricted</h2>
      <p className="text-[13px] text-text-secondary mt-2 max-w-[340px]">
        You don't have permission to view {moduleLabel || 'this section'}. Ask your admin to grant you access.
      </p>
      <div className="flex gap-2.5 mt-[18px]">
        {onRefresh && (
          <button className="dash-btn" onClick={onRefresh}>
            <RefreshCw size={13} /> Refresh
          </button>
        )}
        {onLogout && (
          <button className="dash-btn dash-btn--primary" onClick={onLogout}>
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}
