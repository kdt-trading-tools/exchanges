import { last } from '@khangdt22/utils/array'
import { isNullish } from '@khangdt22/utils/condition'
import type { Numberish } from '@khangdt22/utils/number'
import type { Candle } from '../types'
import type { Exchange, GetCandlesOptions } from '../exchanges'
import type { Timeframe } from './timeframes'
import { toPrice, toQuantity } from './number'

export function isContinuous(current: Candle, next: Candle) {
    return current.closeTime + 1 === next.openTime
}

export function createCandle(openTime: number, closeTime: number, open: Numberish): Candle {
    const price = toPrice(open)
    const volume = toQuantity(0)

    return { openTime, closeTime, open: price, high: price, low: price, close: price, volume }
}

export function ensureContinuous(candles: Candle[], onlyClose = false) {
    for (const [i, candle] of candles.entries()) {
        if (onlyClose) {
            const now = Date.now()
            const closeDate = new Date(candle.closeTime)

            closeDate.setMilliseconds(0)

            if (closeDate.getTime() > now) {
                throw new Error(`Candle close time is in the future: ${candle.closeTime}, current timestamp: ${now}`)
            }
        }

        const next = candles[i + 1]

        if (next && !isContinuous(candle, next)) {
            throw new Error(`Candles are not continuous, current candle open time: ${candle.openTime}, next open time: ${next.openTime}, expected: ${candle.closeTime + 1}`)
        }
    }
}

export function validateCandles(candles: Candle[], since?: number, until?: number) {
    if (candles.length === 0) {
        return
    }

    ensureContinuous(candles)

    if (!isNullish(since) && candles[0].openTime !== since) {
        throw new Error(`Invalid first candle open time, expected: ${since}, actual: ${candles[0].openTime}`)
    }

    if (candles.length > 1) {
        const lastCandle = last(candles)

        if (!isNullish(until) && lastCandle.closeTime !== until) {
            throw new Error(`Invalid last candle close time, expected: ${until}, actual: ${lastCandle.closeTime}`)
        }
    }
}

export interface FetchCandlesOptions extends GetCandlesOptions {
    onStart?: () => Promise<void>
    onEnd?: (candles: Candle[]) => Promise<void>
}

export async function fetchCandles(e: Exchange, symbol: string, timeframe: Timeframe, options?: FetchCandlesOptions) {
    await options?.onStart?.()

    const candles = await e.getCandles(symbol, timeframe, options)

    if (candles.length === 0) {
        return candles
    }

    const lastCandle = last(candles)
    const until = options?.until

    if (!isNullish(until) && lastCandle.closeTime < until) {
        const nextOptions = { ...options, since: lastCandle.closeTime + 1 }
        const nextCandles = await fetchCandles(e, symbol, timeframe, nextOptions)

        candles.push(...nextCandles)
    }

    await options?.onEnd?.(candles)

    return candles
}
