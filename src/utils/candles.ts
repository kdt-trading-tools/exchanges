import type { Candle } from '../types'

export function isContinuous(current: Candle, next: Candle) {
    return current.closeTime + 1 === next.openTime
}

export function ensureContinuous(candles: Candle[]) {
    for (const [i, candle] of candles.entries()) {
        const next = candles[i + 1]

        if (next && !isContinuous(candle, next)) {
            throw new Error(`Candles are not continuous, open time: ${next.openTime}, expected: ${candle.closeTime + 1}`)
        }
    }
}
