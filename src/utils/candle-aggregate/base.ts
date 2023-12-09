import { chunk } from '@khangdt22/utils/array'
import { isNullish } from '@khangdt22/utils/condition'
import { TypedEventEmitter } from '@khangdt22/utils/event'
import type { Fn } from '@khangdt22/utils/function'
import type { Nullable } from '@khangdt22/utils/types'
import type { Exchange, GetCandlesOptions } from '../../exchanges'
import type { Candle, Pair } from '../../types'
import { Timeframe } from '../../constants'
import { validateCandles, fetchCandles } from '../candles'
import { TimeframeHelper } from '../timeframe-helper'
import { sortTimeframes } from '../timeframes'

export type CandlesFetcher = (e: Exchange, s: string, t: Timeframe, o?: GetCandlesOptions) => Promise<Candle[]>

export interface CandleAggregateBaseOptions {
    pairs?: Array<string | Pair>
    timeframes?: Timeframe[]
    fetcher?: CandlesFetcher
    validate?: boolean
    concurrency?: number
}

export abstract class CandleAggregateBase<TEvents extends Record<string, Fn> = any> extends TypedEventEmitter<TEvents> {
    public readonly lowestTimeframe: Timeframe

    protected readonly inputPairs?: Array<string | Pair>
    protected readonly timeframes: Timeframe[]
    protected readonly fetcher: CandlesFetcher
    protected readonly validate: boolean
    protected readonly concurrency: number

    protected constructor(public readonly exchange: Exchange, options: CandleAggregateBaseOptions = {}) {
        super()

        this.inputPairs = options.pairs
        this.timeframes = options.timeframes ?? Object.values(Timeframe)
        this.fetcher = options.fetcher ?? fetchCandles
        this.validate = options.validate ?? true
        this.concurrency = options.concurrency ?? 10
        this.lowestTimeframe = sortTimeframes(this.timeframes)[0]
    }

    protected async getPairs() {
        const pairsChunks = chunk(this.inputPairs ?? await this.exchange.getActivePairs(), this.concurrency)
        const result: Pair[] = []

        for (const pairs of pairsChunks) {
            result.push(...await Promise.all(pairs.map((pair) => this.getPair(pair))))
        }

        return result
    }

    protected async getPair(symbol: string | Pair) {
        if (typeof symbol === 'string') {
            const pair = await this.exchange.getPair(symbol)

            if (isNullish(pair)) {
                throw new Error(`Pair ${symbol} is not supported`)
            }

            return pair
        }

        return symbol
    }

    protected async createTimeframeHelper() {
        const exchange = this.exchange
        const [timezone, symbol] = await Promise.all([exchange.getTimezone(), exchange.getSymbolForSampleData()])
        const sampleData: Record<string, Candle> = {}

        for (const timeframes of chunk(this.timeframes, this.concurrency)) {
            await Promise.all(
                timeframes.map(async (i) => this.fetcher(exchange, symbol, i, { limit: 1 }).then((candles) => {
                    if (candles.length === 0) {
                        throw new Error(`Failed to fetch sample data for timeframe ${i}`)
                    }

                    sampleData[i] = candles[0]
                }))
            )
        }

        return new TimeframeHelper(sampleData, { timezone })
    }

    protected async getCandles(symbol: string, timeframe: Timeframe, since: number, until: number, checkSince = true) {
        if (until <= since) {
            return []
        }

        const candles = await this.fetcher(this.exchange, symbol, timeframe, { since, until })

        if (this.validate) {
            try {
                validateCandles(candles, checkSince ? since : undefined, until)
            } catch (error) {
                throw new Error(`Failed to validate candles for symbol ${symbol}, timeframe: ${timeframe}, from ${since} to ${until}`, { cause: error })
            }
        }

        return candles
    }

    protected getValue<T>(input: Nullable<T>) {
        if (isNullish(input)) {
            throw new Error('Not initialized')
        }

        return input as NonNullable<T>
    }
}
