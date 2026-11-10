/// <reference lib="webworker" />
import { runBacktest, type BtInput } from './core/backtest'

self.onmessage = (e: MessageEvent<BtInput>) => {
  try {
    let last = 0
    const result = runBacktest(e.data, (done, total) => {
      const now = Date.now()
      if (now - last > 120 || done === total) { last = now; self.postMessage({ type: 'progress', done, total }) }
    })
    self.postMessage({ type: 'done', result })
  } catch (err) {
    self.postMessage({ type: 'error', message: (err as Error).message })
  }
}
