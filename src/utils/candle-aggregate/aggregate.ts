import type { Pair, Candle } from '../../types'
import type { Exchange } from '../../exchanges'
import { BaseCandleAggregate, type CandleAggregateBaseOptions } from './base'

interface AggregateOptions {
    emit?: boolean
    aggregateFrom?: Record<string, number>
    listingAt?: number
}

export interface KnownCandles {
    applyAt: number
    candles: Record<string, Candle | undefined>
}

export interface CandleAggregateOptions extends CandleAggregateBaseOptions {
    knownCandles?: Record<string, KnownCandles | undefined>
}

export class CandleAggregate extends BaseCandleAggregate {
    protected readonly knownCandles: Record<string, KnownCandles | undefined>

    public constructor(exchange: Exchange, options: CandleAggregateOptions = {}) {
        super(exchange, options)

        this.knownCandles = options.knownCandles ?? {}
    }

    protected async aggregate(pair: Pair, candle: Candle, isClose: boolean, options: AggregateOptions = {}) {
        const { symbol, precision: { quantity: precision } } = pair
        const { aggregateFrom = {}, emit = true, listingAt } = options
        const aggregatedCandles: Record<string, Candle> = {}
        const { applyAt, candles: knownCandles = {} } = this.knownCandles[symbol] ?? {}

        for (const timeframe of this.timeframes) {
            if (timeframe == this.lowestTimeframe) {
                if (emit) {
                    this.emitCandle(pair, timeframe, candle, isClose)
                }

                continue
            }

            if (aggregateFrom[timeframe] && candle.openTime < aggregateFrom[timeframe]) {
                continue
            }

            const { openTime, closeTime } = this.timeframeHelper.getCandleTimes(timeframe, candle.openTime)
            const knownCandle = knownCandles[timeframe]

            if (knownCandle && applyAt && applyAt == candle.openTime) {
                this.store.setOpenCandle(symbol, timeframe, knownCandle)
            } else if (openTime == candle.openTime || (listingAt && listingAt == candle.openTime)) {
                this.store.createOpenCandle(symbol, timeframe, openTime, closeTime, candle.open)
            }

            const aggregated = this.store.aggregate(symbol, timeframe, candle, isClose, { precision })

            if (emit) {
                this.emitCandle(pair, timeframe, aggregated, aggregated.isClose)
            }

            aggregatedCandles[timeframe] = this.store.getOpenCandle(symbol, timeframe)!
        }

        if (isClose) {
            this.emit('aggregated', pair, candle, aggregatedCandles)
        }
    }

    protected async initPair(pair: Pair, untilCandle: Candle) {
        this.emit('pair-init', pair, untilCandle)

        const openTimes = Object.fromEntries(
            this.timeframes.map((t) => <const>[t, this.timeframeHelper.getOpenTime(t, untilCandle.openTime)])
        )

        const knownUntil = this.knownCandles[pair.symbol]?.applyAt
        const until = untilCandle.openTime - 1
        const lowestOpenTime = Math.min(...Object.values(openTimes))
        const since = knownUntil && knownUntil > lowestOpenTime ? knownUntil : lowestOpenTime

        if (until > since) {
            const fetchOpts = { since, until, validateSince: false }
            const candles = await this.helper.fetchCandles(pair.symbol, this.lowestTimeframe, fetchOpts)
            const listingAt = candles.length > 0 && candles[0].openTime > since ? candles[0].openTime : undefined

            for (const candle of candles) {
                this.aggregate(pair, candle, true, { aggregateFrom: openTimes, listingAt })
            }
        }

        this.store.active(pair.symbol)
        this.emit('pair-initialized', pair)
    }
}
