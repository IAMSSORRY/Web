// CSV 를 엑셀에서 바로 읽기 좋게 바꿔서 내려받게 한다.
// 시간은 "2026-10-09 20:04:50"(한국 시간), 열 이름은 한글, 참/거짓은 예/아니오로 바꾼다.

const HEADERS: Record<string, string> = {
  run_id: '회차',
  id: '번호',
  time: '시각',
  grade: '등급',
  confidence: '신뢰도',
  v_value: '빨강 비율',
  threshold: '빨강 기준',
  dark_ratio: '흠 비율',
  dark_max: '흠 기준',
  roll_detected: '떨어뜨림',
  cam: '카메라',
}

const kst = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

// unix 초 → "2026-10-09 20:04:50" (sv-SE 형식이 YYYY-MM-DD HH:mm:ss 이다)
export const formatTs = (ts: number) => kst.format(ts * 1000)

// 서버의 ISO 시간("2026-10-09T20:04:50.573+09:00")도 같은 형식으로
const formatIso = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : formatTs(t / 1000)
}

const formatCell = (column: string, value: string) => {
  if (column === 'time') return formatIso(value)
  if (value === 'true') return '예'
  if (value === 'false') return '아니오'
  return value
}

// 서버 CSV 의 값에는 쉼표가 들어가지 않는다(숫자, 등급, 카메라 이름뿐).
export function makeReadable(csv: string) {
  const [head, ...rows] = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/)
  const columns = head.split(',')
  return [
    columns.map((c) => HEADERS[c] ?? c).join(','),
    ...rows.map((row) =>
      row
        .split(',')
        .map((v, i) => formatCell(columns[i], v))
        .join(','),
    ),
  ].join('\n')
}

export function saveCsv(csv: string, filename: string) {
  // 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다.
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// 서버 CSV 를 받아 읽기 좋게 바꿔 저장한다. 파일 이름은 서버가 준 것을 쓴다.
export async function downloadServerCsv(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  const name = res.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/)?.[1] ?? 'ssorry.csv'
  saveCsv(makeReadable(await res.text()), name)
}
