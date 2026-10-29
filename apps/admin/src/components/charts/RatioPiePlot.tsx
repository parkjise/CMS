import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export interface RatioSlice {
  name: string
  value: number
  color: string
}

/** 모바일 비율 도넛 (recharts — 따로 받는다, T-043-A) */
export function RatioPiePlot({ data }: { data: RatioSlice[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={60}
          outerRadius={85}
          paddingAngle={2}
        >
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  )
}
