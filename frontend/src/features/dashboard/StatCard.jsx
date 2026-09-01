import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { ArrowUp, ArrowDown } from 'lucide-react'

const ICON_BADGE = {
  purple: 'bg-gradient-to-br from-[#9D8CFF] to-[#7C5CFC] shadow-[0_6px_14px_rgba(124,92,252,0.32)]',
  success: 'bg-gradient-to-br from-[#4ADE80] to-[#16A34A] shadow-[0_6px_14px_rgba(34,197,94,0.32)]',
  danger: 'bg-gradient-to-br from-[#FB7185] to-[#E11D48] shadow-[0_6px_14px_rgba(240,68,56,0.32)]',
  blue: 'bg-gradient-to-br from-[#60A5FA] to-[#2563EB] shadow-[0_6px_14px_rgba(59,130,246,0.32)]',
}

export default function StatCard({ label, value, icon: Icon, tint, trendData, trendColor, trendPct }) {
  const colors = { purple: '#7C5CFC', success: '#22C55E', danger: '#F04438', blue: '#3B82F6' }
  const iconColor = colors[tint] || colors.purple
  const chartData = (trendData || []).map((v, i) => ({ i, v }))
  const hasTrend = chartData.length > 1 && chartData.some((d) => d.v > 0)
  const gradId = `grad-${label.replace(/\s/g, '')}`

  return (
    <div className="flex-1 min-w-0 bg-card-glass backdrop-blur-md border border-border rounded-[20px] shadow-card py-[13px] px-4 transition-all hover:-translate-y-1 hover:shadow-[0_4px_10px_rgba(16,21,42,0.05),0_20px_34px_rgba(16,21,42,0.09)] hover:border-purple/25">
      <div className="flex items-center gap-3">
        <span className={`w-[42px] h-[42px] rounded-[13px] shrink-0 flex items-center justify-center ${ICON_BADGE[tint] || ICON_BADGE.purple}`}>
          <Icon size={19} color="#fff" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] text-text-secondary font-medium">{label}</div>
          <div className="text-[19px] font-extrabold tracking-tight mt-0.5">{value}</div>
        </div>
      </div>
      {trendPct !== undefined && trendPct !== null && (
        <div className="flex items-center gap-1 text-[11px] mt-2" style={{ color: trendPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {trendPct >= 0 ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
          <span className="font-bold">{Math.abs(trendPct)}%</span>
          <span className="text-text-secondary font-medium">vs last week</span>
        </div>
      )}
      {hasTrend ? (
        <div className="h-[30px] mt-1.5 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendColor || iconColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={trendColor || iconColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={trendColor || iconColor} strokeWidth={2} fill={`url(#${gradId})`} isAnimationActive animationDuration={900} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="h-1" />}
    </div>
  )
}
