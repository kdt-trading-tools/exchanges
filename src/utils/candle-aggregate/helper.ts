import { chunk } from '@khangdt22/utils/array'
import { isNullish } from '@khangdt22/utils/condition'
import type { Nullable } from '@khangdt22/utils/types'
import type { Exchange, GetCandlesOptions } from '../../exchanges'
import type { Candle, Pair } from '../../types'
import { Timeframe } from '../../constants'
import { validateCandles, fetchCandles } from '../candles'
import { TimeframeHelper } from '../timeframe-helper'
import { sortTimeframes } from '../timeframes'

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
    public readonly lowestTimeframe: Timeframe
    public readonly timeframes: Timeframe[]

    protected readonly inputPairs?: Array<string | Pair>
    protected readonly fetcher: CandlesFetcher
    protected readonly validateCandles: boolean
    protected readonly concurrency: number

    public constructor(public readonly exchange: Exchange, options: CandleAggregateHelperOptions = {}) {
        this.inputPairs = options.pairs
        this.timeframes = options.timeframes ?? Object.values(Timeframe)
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
        const exchange = this.exchange
        const [timezone, symbol] = await Promise.all([exchange.getTimezone(), exchange.getSymbolForSampleData()])
        const sampleData: Record<string, Candle> = {}

        for (const timeframes of chunk(this.timeframes, this.concurrency)) {
            const requests = timeframes.map(async (i) => [i, await this.getSampleData(symbol, i)] as const)
            const result = Object.fromEntries(await Promise.all(requests))

            Object.assign(sampleData, result)
        }

        return new TimeframeHelper(sampleData, { timezone })
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

    protected async getSampleData(symbol: string, timeframe: Timeframe) {
        const latestCandle = await this.getLatestCandle(symbol, timeframe)

        if (isNullish(latestCandle)) {
            throw new Error(`Failed to get sample data for symbol ${symbol}, timeframe: ${timeframe}`)
        }

        return latestCandle
    }

    protected async getLatestCandle(symbol: string, timeframe: Timeframe) {
        return this.fetchCandles(symbol, timeframe, { limit: 1 }).then((candles) => candles[0])
    }
}
