import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro'
import type { KLineData } from 'klinecharts'
import BinanceDatafeed from './BinanceDatafeed'
import { calculateSignal, backtestStrategy } from './signalEngine'

export type SignalResult = ReturnType<typeof calculateSignal>
export type BacktestResult = ReturnType<typeof backtestStrategy>

export default class SignalDatafeed implements Datafeed {
  private _inner: BinanceDatafeed
  private _candles: KLineData[] = []
  private _onSignal?: (r: SignalResult) => void
  private _onBacktest?: (r: BacktestResult) => void
  private _btTimer?: ReturnType<typeof setTimeout>
  private _btMinInterval = 1000
  private _lastBtRun = 0

  constructor (
    onSignal?: (r: SignalResult) => void,
    onBacktest?: (r: BacktestResult) => void
  ) {
    this._inner = new BinanceDatafeed()
    this._onSignal = onSignal
    this._onBacktest = onBacktest
  }

  async searchSymbols (search?: string): Promise<SymbolInfo[]> {
    return this._inner.searchSymbols(search)
  }

  async getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]> {
    const data = await this._inner.getHistoryKLineData(symbol, period, from, to)
    this._candles = data
    this._emitSignal()
    this._scheduleBacktest(true)
    return data
  }

  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    this._inner.subscribe(symbol, period, (candle: KLineData) => {
      callback(candle)
      this._mergeCandle(candle)
    })
  }

  unsubscribe (symbol: SymbolInfo, period: Period): void {
    this._inner.unsubscribe(symbol, period)
    this._candles = []
    if (this._btTimer) {
      clearTimeout(this._btTimer)
      this._btTimer = undefined
    }
  }

  private _mergeCandle (candle: KLineData) {
    const arr = this._candles
    const last = arr[arr.length - 1]
    let newCandleClosed = false
    if (last && last.timestamp === candle.timestamp) {
      arr[arr.length - 1] = candle
    } else if (!last || candle.timestamp > last.timestamp) {
      arr.push(candle)
      if (arr.length > 500) arr.shift()
      newCandleClosed = true
    }
    this._emitSignal()
    if (newCandleClosed) this._scheduleBacktest(false)
  }

  private _emitSignal () {
    if (!this._onSignal) return
    this._onSignal(calculateSignal(this._candles))
  }

  private _scheduleBacktest (immediate: boolean) {
    if (!this._onBacktest) return
    if (this._btTimer) {
      clearTimeout(this._btTimer)
      this._btTimer = undefined
    }
    if (immediate) {
      this._runBacktest()
      return
    }
    const elapsed = Date.now() - this._lastBtRun
    const delay = Math.max(0, this._btMinInterval - elapsed)
    this._btTimer = setTimeout(() => this._runBacktest(), delay)
  }

  private _runBacktest () {
    if (!this._onBacktest) return
    this._lastBtRun = Date.now()
    this._btTimer = undefined
    try {
      this._onBacktest(backtestStrategy(this._candles))
    } catch {
      // backtest may throw on tiny datasets; ignore
    }
  }
}

