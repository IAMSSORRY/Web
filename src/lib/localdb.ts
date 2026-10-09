// 브라우저 IndexedDB 에 판정 기록을 쌓아 둔다.
// 서버는 메모리에만 들고 있어서 통계 초기화나 재시작 때 기록이 사라지기 때문이다.
// 브라우저(기기)마다 따로 저장되며 다른 기기와 공유되지 않는다.
import type { JudgeRecord } from './api'

const DB_NAME = 'ssorry'
const STORE = 'judges'

// 서버 id 는 초기화하면 다시 1부터라서 ts 와 묶어 키로 쓴다.
export type StoredJudge = JudgeRecord & { key: string; cam?: string }

const keyOf = (r: JudgeRecord) => `${Math.round(r.ts * 1000)}-${r.id}`

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key' })
      store.createIndex('ts', 'ts')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbPromise = null
      reject(req.error)
    }
  })
  return dbPromise
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })
}

// 같은 판정이 다시 오면(재연결 snapshot, 굴림 결과 반영) 덮어쓴다.
export async function saveJudges(records: (JudgeRecord & { cam?: string })[]) {
  if (!records.length) return
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  for (const r of records) {
    const { id, grade, confidence, v_value, threshold, ts, roll_detected, cam, extra } = r
    store.put({ key: keyOf(r), id, grade, confidence, v_value, threshold, ts, roll_detected, cam, extra })
  }
  await done(tx)
}

// 오래된 것부터
export async function loadJudges(): Promise<StoredJudge[]> {
  const db = await open()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).index('ts').getAll()
  await done(tx)
  return req.result
}

export async function countJudges(): Promise<number> {
  const db = await open()
  const tx = db.transaction(STORE, 'readonly')
  const req = tx.objectStore(STORE).count()
  await done(tx)
  return req.result
}
