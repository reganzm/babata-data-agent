const FIELD_LABELS: Record<string, string> = {
  ds: '日期',
  date: '日期',
  day: '日期',
  voice_room_type: '房间类型',
  diamond_wan: '钻石流水(万)',
  daily_total_wan: '日总流水(万)',
  pct: '占比',
  amount: '金额',
  count: '数量',
  total: '合计',
  avg: '均值',
  rate: '比率',
}

export function humanizeFieldLabel(field: string): string {
  const key = field.trim()
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  if (FIELD_LABELS[key.toLowerCase()]) return FIELD_LABELS[key.toLowerCase()]

  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export const CHART_TYPE_LABELS: Record<string, string> = {
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  heatmap: '热力图',
  funnel: '漏斗图',
  graph: '关系图',
}
