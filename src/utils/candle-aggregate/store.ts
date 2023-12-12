import PQueue from 'p-queue'
import type { Candle } from '../../types'
import { createCandle, isContinuous } from '../candles'
import { round } from '../number'
import type { TimeframeStr } from '../timeframes'

export interface CandleAggregateStoreItem {
    isActive?: boolean
    queue: PQueue
    openCandles: Record<TimeframeStr, Candle | undefined>
    lastCloseCandles: Record<TimeframeStr, Candle | undefined>
    lastAggregateCandles: Record<TimeframeStr, Candle | undefined>
}

interface AggregateOpts {
    precision?: number
}

export class CandleAggregateStore {
    protected readonly items: Record<string, CandleAggregateStoreItem> = {}

    public aggregate(symbol: string, tf: TimeframeStr, candle: Candle, isClose: boolean, options: AggregateOpts = {}) {
        if (!this.isValidAggregateCandle(symbol, tf, candle)) {
            throw new Error(`Aggregate candle (${candle.openTime}) for symbol ${symbol} (timeframe: ${tf}) is not continuous with last aggregated candle (${this.items[symbol]?.lastAggregateCandles[tf]?.openTime})`)
        }

        const openCandle = this.getOpenCandle(symbol, tf)
        const { precision } = options

        if (!openCandle) {
            throw new Error(`Missing open candle for symbol ${symbol} (timeframe: ${tf}), aggregate candle: ${candle.openTime}`)
        }

        if (candle.openTime < openCandle.openTime) {
            throw new Error(`Invalid aggregate candle (${candle.openTime}) for symbol ${symbol} (timeframe: ${tf}): ${candle.openTime} < ${openCandle.openTime}`)
        }

        const aggregateCandle = { ...openCandle }
        const volume = aggregateCandle.volume + candle.volume
        const isCandleClose = isClose && candle.closeTime === aggregateCandle.closeTime

        aggregateCandle.high = Math.max(aggregateCandle.high, candle.high)
        aggregateCandle.low = Math.min(aggregateCandle.low, candle.low)
        aggregateCandle.close = candle.close
        aggregateCandle.volume = precision ? round(volume, precision) : volume

        this.items[symbol].lastAggregateCandles[tf] = candle

        if (isClose) {
            this.items[symbol].openCandles[tf] = aggregateCandle
        }

        if (isCandleClose) {
            this.closeOpenCandle(symbol, tf)
        }

        return { ...aggregateCandle, isClose: isCandleClose } as Candle & { isClose: boolean }
    }

    public has(symbol: string) {
        return symbol in this.items
    }

    public hasOpenCandle(symbol: string, timeframe: TimeframeStr) {
        return !!this.items[symbol]?.openCandles[timeframe]
    }

    public isActive(symbol: string) {
        return !!this.items[symbol]?.isActive
    }

    public isContinuous(symbol: string, timeframe: TimeframeStr, candle: Candle) {
        const lastCloseCandle = this.getLastCloseCandle(symbol, timeframe)

        if (!lastCloseCandle) {
            return true
        }

        return isContinuous(lastCloseCandle, candle)
    }

    public isValidAggregateCandle(symbol: string, timeframe: TimeframeStr, candle: Candle) {
        const lastAggregateCandle = this.items[symbol]?.lastAggregateCandles[timeframe]

        if (!lastAggregateCandle) {
            return true
        }

        return candle.openTime === lastAggregateCandle.openTime || isContinuous(lastAggregateCandle, candle)
    }

    public get(symbol: string) {
        return this.items[symbol] ?? this.create(symbol)
    }

    public getLastCloseCandle(symbol: string, timeframe: TimeframeStr) {
        return this.items[symbol]?.lastCloseCandles[timeframe]
    }

    public getOpenCandle(symbol: string, timeframe: TimeframeStr) {
        return this.items[symbol]?.openCandles[timeframe]
    }

    public setLastCloseCandle(symbol: string, timeframe: TimeframeStr, candle: Candle) {
        if (!this.isContinuous(symbol, timeframe, candle)) {
            throw new Error(`New last close candle (${candle.openTime}) for symbol ${symbol} (timeframe: ${timeframe}) are not continuous with last close candle (${this.getLastCloseCandle(symbol, timeframe)?.openTime})`)
        }

        return this.get(symbol).lastCloseCandles[timeframe] = candle
    }

    public setOpenCandle(symbol: string, timeframe: TimeframeStr, candle: Candle) {
        if (this.hasOpenCandle(symbol, timeframe)) {
            throw new Error(`Open candle for symbol ${symbol} (timeframe: ${timeframe}) already exists`)
        }

        if (!this.isContinuous(symbol, timeframe, candle)) {
            throw new Error(`New open candle (${candle.openTime}) for symbol ${symbol} (timeframe: ${timeframe}) are not continuous with last close candle (${this.getLastCloseCandle(symbol, timeframe)?.openTime})`)
        }

        return this.get(symbol).openCandles[timeframe] = candle
    }

    public createOpenCandle(symbol: string, tf: TimeframeStr, openTime: number, closeTime: number, price: number) {
        return this.setOpenCandle(symbol, tf, createCandle(openTime, closeTime, price))
    }

    public create(symbol: string) {
        return this.items[symbol] = {
            openCandles: {},
            lastCloseCandles: {},
            lastAggregateCandles: {},
            queue: new PQueue({ autoStart: false, concurrency: 1 }),
        }
    }

    public closeOpenCandle(symbol: string, timeframe: TimeframeStr) {
        const openCandle = this.getOpenCandle(symbol, timeframe)

        if (openCandle) {
            this.setLastCloseCandle(symbol, timeframe, openCandle)
        }

        delete this.items[symbol]?.openCandles[timeframe]
    }

    public remove(symbol: string) {
        this.items[symbol]?.queue.clear()
        delete this.items[symbol]
    }

    public clean() {
        for (const symbol of Object.keys(this.items)) {
            this.remove(symbol)
        }
    }

    public active(symbol: string) {
        this.get(symbol).isActive = true
        this.startQueue(symbol)
    }

    public startQueue(symbol: string) {
        this.items[symbol]?.queue.start()
    }

    public addToQueue<T>(symbol: string, fn: () => Promise<T>, priority?: number): Promise<void | T> {
        return this.get(symbol).queue.add(fn, { priority })
    }
}
