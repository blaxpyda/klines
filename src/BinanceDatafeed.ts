import type { KLineData } from 'klinecharts'
import type { Datafeed, SymbolInfo, Period, DatafeedSubscribeCallback } from '@klinecharts/pro'

const REST_BASE = 'https://api.binance.com'
const WS_BASE = 'wss://stream.binance.com:9443/ws'

function toBinanceInterval (period: Period): string {
  const { multiplier, timespan } = period
  switch (timespan) {
    case 'second': return `${multiplier}s`
    case 'minute': return `${multiplier}m`
    case 'hour': return `${multiplier}h`
    case 'day': return `${multiplier}d`
    case 'week': return `${multiplier}w`
    case 'month': return `${multiplier}M`
    default: return `${multiplier}m`
  }
}

export default class BinanceDatafeed implements Datafeed {
  private _ws?: WebSocket
  private _prevStream?: string

  async searchSymbols (search?: string): Promise<SymbolInfo[]> {
    const response = await fetch(`${REST_BASE}/api/v3/exchangeInfo`)
    const result = await response.json()
    const q = (search ?? '').toUpperCase()
    return (result.symbols || [])
      .filter((s: any) => s.status === 'TRADING' && (q === '' || s.symbol.includes(q)))
      .map((s: any) => ({
        ticker: s.symbol,
        shortName: `${s.baseAsset}/${s.quoteAsset}`,
        name: `${s.baseAsset} / ${s.quoteAsset}`,
        market: 'crypto',
        exchange: 'BINANCE',
        priceCurrency: s.quoteAsset.toLowerCase(),
        type: 'crypto'
      }))
  }

  async getHistoryKLineData (symbol: SymbolInfo, period: Period, from: number, to: number): Promise<KLineData[]> {
    const interval = toBinanceInterval(period)
    const params = new URLSearchParams({
      symbol: symbol.ticker,
      interval,
      startTime: String(from),
      endTime: String(to),
      limit: '1000'
    })
    const response = await fetch(`${REST_BASE}/api/v3/klines?${params.toString()}`)
    const result = await response.json()
    return (result || []).map((d: any[]) => ({
      timestamp: d[0],
      open: Number(d[1]),
      high: Number(d[2]),
      low: Number(d[3]),
      close: Number(d[4]),
      volume: Number(d[5]),
      turnover: Number(d[7])
    }))
  }

  subscribe (symbol: SymbolInfo, period: Period, callback: DatafeedSubscribeCallback): void {
    const interval = toBinanceInterval(period)
    const stream = `${symbol.ticker.toLowerCase()}@kline_${interval}`
    if (this._prevStream !== stream) {
      this._ws?.close()
      this._ws = new WebSocket(`${WS_BASE}/${stream}`)
      this._ws.onmessage = event => {
        const msg = JSON.parse(event.data)
        const k = msg.k
        if (k) {
          callback({
            timestamp: k.t,
            open: Number(k.o),
            high: Number(k.h),
            low: Number(k.l),
            close: Number(k.c),
            volume: Number(k.v),
            turnover: Number(k.q)
          })
        }
      }
    }
    this._prevStream = stream
  }

  unsubscribe (_symbol: SymbolInfo, _period: Period): void {
    this._ws?.close()
    this._ws = undefined
    this._prevStream = undefined
  }
}
