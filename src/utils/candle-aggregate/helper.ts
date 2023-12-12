import { chunk } from '@khangdt22/utils/array'
import { isNullish } from '@khangdt22/utils/condition'
import type { Nullable } from '@khangdt22/utils/types'
import type { Exchange, GetCandlesOptions } from '../../exchanges'
import type { Candle, Pair } from '../../types'
import { validateCandles, fetchCandles } from '../candles'
import { TimeframeHelper } from '../timeframe-helper'
import { sortTimeframes, type Timeframe, type TimeframeStr, toTimeframeStr } from '../timeframes'
import { TimeframeEnum } from '../../constants'

export type CandlesFetcher = (e: Exchange, s: string, t: Timeframe, o?: GetCandlesOptions) => Promise<Candle[]>

interface FetchCandlesOptions extends GetCandlesOptions {
    validateSince?: boolean
}

export interface CandleAggregateHelperOptions {
    pairs?: Array<string | Pair>
    timeframes?: Timeframe[]
    fetcher?: CandlesFetcher
    validateCandles?: boolean
    concurrency?: number
}

export class CandleAggregateHelper {
    public readonly lowestTimeframe: TimeframeStr
    public readonly timeframes: TimeframeStr[]
    public readonly concurrency: number

    protected readonly inputPairs?: Array<string | Pair>
    protected readonly fetcher: CandlesFetcher
    protected readonly validateCandles: boolean
    protected readonly divideBy: Record<string, Promise<number>> = {}

    public constructor(public readonly exchange: Exchange, options: CandleAggregateHelperOptions = {}) {
        this.inputPairs = options.pairs
        this.timeframes = options.timeframes?.map((i) => toTimeframeStr(i)) ?? Object.values(TimeframeEnum)
        this.fetcher = options.fetcher ?? fetchCandles
        this.validateCandles = options.validateCandles ?? true
        this.concurrency = options.concurrency ?? 10
        this.lowestTimeframe = sortTimeframes(this.timeframes)[0]
    }

    public async getPairs() {
        const pairsChunks = chunk(this.inputPairs ?? await this.exchange.getActivePairs(), this.concurrency)
        const result: Pair[] = []

        for (const pairs of pairsChunks) {
            result.push(...await Promise.all(pairs.map((pair) => this.getPair(pair))))
        }

        return result
    }

    public async createTimeframeHelper() {
        return new TimeframeHelper({ timezone: await this.exchange.getTimezone() })
    }

    public async fetchCandles(symbol: string, timeframe: Timeframe, options: FetchCandlesOptions = {}) {
        const { since, until, limit, validateSince } = options

        if ((limit && limit <= 0) || (!isNullish(since) && !isNullish(until) && until <= since)) {
            return []
        }

        const candles = await this.fetcher(this.exchange, symbol, timeframe, options)

        if (this.validateCandles) {
            try {
                validateCandles(candles, validateSince ? since : undefined, until)
            } catch (error) {
                throw new Error(`Failed to validate candles for symbol ${symbol} (timeframe: ${timeframe}` + (isNullish(since) ? '' : `, since: ${since}`) + (isNullish(until) ? '' : `, until: ${until}`) + ')', { cause: error })
            }
        }

        return candles
    }

    public getPropertyValue<T>(input: Nullable<T>) {
        if (isNullish(input)) {
            throw new Error('Not initialized')
        }

        return input as NonNullable<T>
    }

    public async getLatestOpenTime(symbol: string, timeframe: Timeframe) {
        return this.getLatestCandle(symbol, timeframe).then((candle) => candle?.openTime)
    }

    public async getLatestCandle(symbol: string, timeframe: Timeframe) {
        return this.fetchCandles(symbol, timeframe, { limit: 1 }).then((candles) => candles.at(0))
    }

    public async getDivideBy(symbol: string, timeframe: Timeframe) {
        return this.divideBy[`${symbol}_${timeframe}`] ??= this.getLatestOpenTime(symbol, timeframe).then((openTime) => {
            if (isNullish(openTime)) {
                throw new Error(`Failed to get latest open time for symbol ${symbol} (timeframe: ${timeframe})`)
            }

            return openTime
        })
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
}
