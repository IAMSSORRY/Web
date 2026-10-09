// 서버 메시지는 "~있다", "~없다" 같은 평서형으로 온다. 화면에는 존댓말로 바꿔 보여준다.
// 서버가 존댓말로 보내게 되면 이 변환은 아무것도 바꾸지 않는다.
const ENDINGS: [string, string][] = [
  ['있지 않다', '있지 않습니다'],
  ['않았다', '않았습니다'],
  ['않다', '않습니다'],
  ['있다', '있습니다'],
  ['없다', '없습니다'],
  ['였다', '였습니다'],
  ['었다', '었습니다'],
  ['았다', '았습니다'],
  ['렸다', '렸습니다'],
  ['했다', '했습니다'],
  ['됐다', '됐습니다'],
  ['된다', '됩니다'],
  ['한다', '합니다'],
  ['이다', '입니다'],
]

// 어절 끝(공백, 문장부호, 괄호, 줄 끝 앞)의 어미만 바꾼다.
const pattern = new RegExp(`(${ENDINGS.map(([from]) => from).join('|')})(?=$|[\\s.,!?)\\]—–-])`, 'g')
const table = new Map(ENDINGS)

export function polite(text: string): string
export function polite(text: string | null | undefined): string | undefined
export function polite(text: string | null | undefined) {
  if (!text) return undefined
  return text.replace(pattern, (m) => table.get(m) ?? m)
}
