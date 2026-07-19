import { defaultData } from './seed'
import type { AppData } from '../types'

const STORAGE_KEY = 'valar-morghulis:v1'

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(defaultData)
    const parsed = JSON.parse(raw) as AppData
    return parsed.version === 1 ? parsed : structuredClone(defaultData)
  } catch {
    return structuredClone(defaultData)
  }
}

export function saveData(data: AppData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function resetData() {
  localStorage.removeItem(STORAGE_KEY)
  return structuredClone(defaultData)
}
