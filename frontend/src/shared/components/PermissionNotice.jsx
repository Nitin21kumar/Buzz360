import { Lock } from 'lucide-react'


export default function PermissionNotice({ label = 'existing data', detail }) {
  return (
    <div className="flex items-start gap-2.5 bg-track-bg border border-dashed border-border rounded-2xl py-3.5 px-4 my-3 text-text-secondary text-[13px]">
      <Lock size={16} className="shrink-0 mt-0.5" />
      <div>
        <span>You don't have permission to use {label} yet. Ask your admin to grant you access.</span>
        {detail && <div className="mt-1 text-[12px] opacity-80">Missing grant: <code>{String(detail).replace(/^You don't have access to /, '').replace(/\.$/, '')}</code></div>}
      </div>
    </div>
  )
}
