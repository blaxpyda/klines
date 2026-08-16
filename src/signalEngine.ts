// -- Math helpers -- 
function calculateEMA(data, period) {
  const ema = []
  const mult = 2 / (period + 1)
  let prev = data[0].close
  for (let i = 0; i < data.length; i++) {
    const val = i === 0 ? data[i].close : (data[i].close - prev) * mult + prev
    ema.push(val)
    prev = val
  }
  return ema
}

function calculateRSI(data, period) {
  const rsi = []
  let avgGain = 0, avgLoss = 0
  
  for (let i = 1; i <= period; i++) {
    const change = data[i].close - data[i - 1].close
    if (change > 0) avgGain += change
    else avgLoss += Math.abs(change)
  }
  avgGain /= period
  avgLoss /= period
  
  for (let i = period; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? Math.abs(change) : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    const rs = avgGain / avgLoss
    rsi.push(100 - (100 / (1 + rs)))
  }
  return rsi
}

function calculateSMA(data, period) {
  const sma = []
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) sum += data[i - j].close
    sma.push(sum / period)
  }
  return sma
}

// SIGBAL ENGINE - multi indicator confluence
export function calculateSignal(data) {
  if (data.length < 50) return { signal: 'NEUTRAL', score: 0, reasons: [] }

  const last = data[data.length - 1]
  const prev = data[data.length - 2]

  // --- 1. TREND: EMA 20 vs EMA 50 ---
  const ema20 = calculateEMA(data, 20)
  const ema50 = calculateEMA(data, 50)
  const lastEma20 = ema20[ema20.length - 1]
  const lastEma50 = ema50[ema50.length - 1]
  const trendBull = lastEma20 > lastEma50
  const trendBear = lastEma20 < lastEma50

  // --- 2. MOMENTUM: RSI(14) ---
  const rsi = calculateRSI(data, 14)
  const lastRsi = rsi[rsi.length - 1]
  const momentumBull = lastRsi > 50 && lastRsi < 70  // Strong but not overbought
  const momentumBear = lastRsi < 50 && lastRsi > 30  // Weak but not oversold

  // --- 3. VOLUME: Current vs SMA 20 ---
  const volSMA = calculateSMA(data.map(d => ({ close: d.volume })), 20)
  const lastVolSMA = volSMA[volSMA.length - 1]
  const volumeConfirm = last.volume > lastVolSMA

  // --- SCORING ---
  let score = 0
  const reasons = []

  if (trendBull) { score += 1; reasons.push('EMA20 > EMA50') }
  if (trendBear) { score -= 1; reasons.push('EMA20 < EMA50') }
  
  if (momentumBull) { score += 1; reasons.push(`RSI ${lastRsi.toFixed(1)} (strong)`) }
  if (momentumBear) { score -= 1; reasons.push(`RSI ${lastRsi.toFixed(1)} (weak)`) }

  if (volumeConfirm) { 
    score += (trendBull ? 1 : trendBear ? -1 : 0)
    reasons.push('Volume above avg') 
  }

  // --- SIGNAL ---
  let signal = 'NEUTRAL'
  if (score >= 2) signal = 'BUY'
  if (score <= -2) signal = 'SELL'

  return { signal, score, reasons, details: { ema20: lastEma20, ema50: lastEma50, rsi: lastRsi } }
}

export function backtestStrategy(data){
  const trades = []
  let position = null 
  let entryPrice = 0 

  for (let i = 50; i < data.length - 1; i++){
    const slice = data.slice(0, i + 1)
    const sig = calculateSignal(slice)

    if (sig.signal == 'BUY' && !position){
      position = 'long'
      entryPrice = data[i + 1].open 
    }
    else if (sig.signal === 'SELL' && position === 'long'){
      const exit = data[i + 1].open
      const pnl = ((exit-entryPrice) / entryPrice) * 100
      trades.push(pnl)
      position = null
    }
  }

  // close open position at end 
  if (position){
    trades.push(((data[data.length - 1].close - entryPrice) / entryPrice) * 100)
  }

  const wins = trades.filter(t => t > 0).length
  return {
    totalTrades: trades.length,
    winRate: trades.length ? (wins / trades.length) * 100 : 0,
    totalReturn: trades.reduce((a, b) => a + b, 0),
    avgTrade: trades.length ? trades.reduce((a, b) => a + b, 0) / trades.length : 0,
    maxDrawdown: calculateMaxDrawdown(trades),
    trades
  }
}

function calculateMaxDrawdown(trades) {
  let peak = 0, running = 0, maxDD = 0
  for (const t of trades) {
    running += t
    if (running > peak) peak = running
    maxDD = Math.max(maxDD, peak - running)
  }
  return maxDD
}

