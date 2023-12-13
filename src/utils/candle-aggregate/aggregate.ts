import { chunk } from '@khangdt22/utils/array'
import type { Pair, Candle } from '../../types'
import type { Exchange } from '../../exchanges'
import type { TimeframeStr } from '../timeframes'
import { BaseCandleAggregate, type CandleAggregateBaseOptions } from './base'

interface AggregateOptions {
    emit?: boolean
    aggregateFrom?: Record<TimeframeStr, number>
    listingAt?: number
}

export interface KnownCandles {
    applyAt: number
    candles: Record<TimeframeStr, Candle | undefined>
}

export interface CandleAggregateOptions extends CandleAggregateBaseOptions {
    knownCandles?: Record<string, KnownCandles | undefined>
}

export class CandleAggregate extends BaseCandleAggregate {
    protected readonly knownCandles: Record<string, KnownCandles | undefined>
    protected readonly initializingPairs: Set<string>

    public constructor(exchange: Exchange, options: CandleAggregateOptions = {}) {
        super(exchange, options)

        this.knownCandles = options.knownCandles ?? {}
        this.initializingPairs = new Set<string>()
    }

    protected async aggregate(pair: Pair, candle: Candle, isClose: boolean, options: AggregateOptions = {}) {
        const { symbol, precision: { quantity: precision } } = pair
        const { aggregateFrom = {}, emit = true, listingAt } = options
        const aggregatedCandles: Record<string, Candle> = {}
        const { applyAt, candles: knownCandles = {} } = this.knownCandles[symbol] ?? {}

        for (const timeframe of this.timeframes) {
            if (timeframe === this.lowestTimeframe) {
                if (emit) {
                    this.emitCandle(pair, timeframe, candle, isClose)
                }

                continue
            }

            if (aggregateFrom[timeframe] && candle.openTime < aggregateFrom[timeframe]) {
                continue
            }

            if (!this.store.hasOpenCandle(symbol, timeframe)) {
                const { openTime, closeTime } = await this.getCandleTimes(symbol, timeframe, candle.openTime)
                const knownCandle = knownCandles[timeframe]

                if (openTime == candle.openTime || (listingAt && listingAt == candle.openTime)) {
                    this.store.createOpenCandle(symbol, timeframe, openTime, closeTime, candle.open)
                } else if (knownCandle && applyAt && applyAt == candle.openTime) {
                    this.store.setOpenCandle(symbol, timeframe, knownCandle)
                }
            }

            const aggregated = this.store.aggregate(symbol, timeframe, candle, isClose, { precision })

            if (emit) {
                this.emitCandle(pair, timeframe, aggregated, aggregated.isClose)
            }

            aggregatedCandles[timeframe] = this.store.getOpenCandle(symbol, timeframe) ?? aggregated
        }

        if (isClose && this.store.isActive(symbol)) {
            this.emit('aggregated', pair, candle, aggregatedCandles)
        }
    }

    protected async initPair(pair: Pair, untilCandle: Candle) {
        if (this.initializingPairs.has(pair.symbol)) {
            return
        }

        this.initializingPairs.add(pair.symbol)
        this.emit('pair-init', pair, untilCandle)

        const openTimes = await this.getInitOpenTimes(pair.symbol, untilCandle.openTime)
        const knownUntil = this.knownCandles[pair.symbol]?.applyAt

        const until = untilCandle.openTime - 1
        const since = knownUntil ?? Math.min(...Object.values(openTimes))

        if (until > since) {
            const fetchOpts = { since, until, validateSince: false }
            const candles = await this.helper.fetchCandles(pair.symbol, this.lowestTimeframe, fetchOpts)
            const listingAt = candles.length > 0 && candles[0].openTime > since ? candles[0].openTime : undefined

            for (const candle of candles) {
                this.aggregate(pair, candle, true, { aggregateFrom: openTimes, listingAt })
            }
        }

        this.store.active(pair.symbol)
        this.initializingPairs.delete(pair.symbol)
        this.emit('pair-initialized', pair)
    }

    protected async getCandleTimes(symbol: string, timeframe: TimeframeStr, from: number) {
        const openTime = await this.getOpenTime(symbol, timeframe, from)
        const closeTime = this.timeframeHelper.getCloseTime(timeframe, openTime)

        return { openTime, closeTime }
    }

    protected async getInitOpenTimes(symbol: string, from: number) {
        const result: Array<[TimeframeStr, number]> = []
        const chunks = chunk(this.timeframes.filter((t) => t !== this.lowestTimeframe), this.helper.concurrency)

        for (const timeframes of chunks) {
            result.push(
                ...(await Promise.all(timeframes.map(async (t) => <any>[t, await this.getOpenTime(symbol, t, from)])))
            )
        }

        return Object.fromEntries(result)
    }

    protected async getOpenTime(symbol: string, timeframe: TimeframeStr, from: number) {
        const lastCloseCandle = this.store.getLastCloseCandle(symbol, timeframe)
        const knownOpenTime = lastCloseCandle?.openTime ?? this.knownCandles[symbol]?.candles[timeframe]?.openTime
        const baseTime = knownOpenTime ?? await this.helper.getBaseTime(symbol, timeframe, this.timeframeHelper)

        return this.timeframeHelper.getOpenTime(timeframe, from, baseTime)
    }
}
