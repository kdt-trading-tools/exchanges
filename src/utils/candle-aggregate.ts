import { TypedEventEmitter } from '@khangdt22/utils/event'
import PQueue from 'p-queue'
import type { Candle, Pair } from '../types'
import { Exchange, type GetCandlesOptions } from '../exchanges'
import { Timeframe } from '../constants'
import { TimeframeHelper } from './timeframe'
import { createCandle, ensureContinuous } from './candles'
import { round } from './number'

export type GetCandlesFn = (e: Exchange, s: string, t: Timeframe, options?: GetCandlesOptions) => Promise<Candle[]>

export interface CandleAggregateOptions {
    symbols?: string[]
    timeframes?: Timeframe[]
    getCandlesFn?: GetCandlesFn
    handlePairUpdate?: boolean
    initConcurrency?: number
}

export type CandleAggregateEvents = {
    'init': () => void
    'initialized': () => void
    'symbol-init': (symbol: string) => void
    'symbol-initialized': (symbol: string) => void
    'candle': (symbol: string, timeframe: Timeframe, candle: Candle, isClose: boolean) => void
}

export interface SymbolContext {
    initialized: boolean
    openCandles: Record<string, Candle>
    lastCloseCandle?: Candle
}

export class CandleAggregate extends TypedEventEmitter<CandleAggregateEvents> {
    protected readonly symbols?: string[]
    protected readonly timeframes: Timeframe[]
    protected readonly getCandlesFn: GetCandlesFn
    protected readonly handlePairUpdate: boolean
    protected readonly initQueue: PQueue
    protected readonly queues: Record<string, PQueue> = {}
    protected readonly contexts: Record<string, SymbolContext> = {}

    #timeframeHelper?: TimeframeHelper
    #lowestTimeframe!: Timeframe
    #pairs!: Record<string, Pair>

    public constructor(public readonly exchange: Exchange, options: CandleAggregateOptions = {}) {
        super()

        this.symbols = options.symbols
        this.timeframes = options.timeframes ?? Object.values(Timeframe)
        this.getCandlesFn = options.getCandlesFn ?? ((e, s, t, o) => e.getCandles(s, t, o))
        this.handlePairUpdate = options.handlePairUpdate ?? true
        this.initQueue = new PQueue({ concurrency: options.initConcurrency ?? 10 })
    }

    protected get timeframeHelper() {
        if (!this.#timeframeHelper) {
            throw new Error('Not initialized')
        }

        return this.#timeframeHelper
    }

    public async start() {
        this.emit('init')

        this.#timeframeHelper = await this.createTimeframeHelper()
        this.#lowestTimeframe = this.timeframeHelper.sort(this.timeframes)[0]

        const symbols = this.symbols ?? await this.exchange.getActivePairs().then((ps) => ps.map((p) => p.symbol)) ?? []
        const watchParams = symbols.map((symbol) => [symbol, this.#lowestTimeframe] as const)

        this.#pairs = Object.fromEntries(
            await Promise.all(symbols.map(async (s) => [s, (await this.exchange.getPair(s))!] as const))
        )

        this.exchange.on('candle', (symbol, timeframe, candle, isClose) => {
            if (timeframe !== this.#lowestTimeframe) {
                return
            }

            const pair = this.#pairs[symbol]

            if (!this.contexts[symbol]) {
                this.contexts[symbol] = {
                    initialized: false,
                    openCandles: {},
                }

                this.queues[symbol] = new PQueue({ autoStart: false, concurrency: 1 })

                this.initQueue.add(async () => this.initPair(pair, candle, symbols.length)).catch((error) => {
                    throw error
                })
            }

            if (!isClose && !this.contexts[symbol].initialized) {
                return
            }

            this.queues[symbol].add(() => this.aggregate(pair, candle, isClose), { priority: -candle.openTime })
        })

        if (this.handlePairUpdate) {
            this.exchange.on('pair-added', this.onNewPair.bind(this))
            this.exchange.on('pair-update', this.onPairUpdate.bind(this))
            this.exchange.on('pair-removed', this.onPairUpdate.bind(this))

            await this.exchange.watchPairs()
        }

        await this.exchange.watchCandlesBatch(watchParams)
    }

    protected aggregate({ symbol, precision }: Pair, candle: Candle, isClose: boolean) {
        if (isClose && this.contexts[symbol]?.lastCloseCandle) {
            ensureContinuous([this.contexts[symbol].lastCloseCandle!, candle])
        }

        const helper = this.timeframeHelper

        for (const timeframe of this.timeframes) {
            const openTime = helper.getOpenTime(timeframe, candle.openTime)
            const closeTime = this.timeframeHelper.getCloseTime(timeframe, openTime)

            if (openTime === candle.openTime) {
                this.contexts[symbol].openCandles[timeframe] = createCandle(openTime, closeTime, candle.open)
            }

            if (!this.contexts[symbol].openCandles[timeframe]) {
                continue
            }

            const openCandle = { ...this.contexts[symbol].openCandles[timeframe] }
            const volume = round(openCandle.volume + candle.volume, precision.quantity)

            openCandle.high = Math.max(openCandle.high, candle.high)
            openCandle.low = Math.min(openCandle.low, candle.low)
            openCandle.close = candle.close

            if (isClose) {
                openCandle.volume = volume
            }

            this.emitCandle(symbol, timeframe, { ...openCandle, volume }, isClose && closeTime === candle.closeTime)
            this.contexts[symbol].openCandles[timeframe] = openCandle
        }

        if (isClose) {
            this.contexts[symbol].lastCloseCandle = candle
        }
    }

    protected emitCandle(symbol: string, timeframe: Timeframe, candle: Candle, isClose: boolean) {
        if (!this.contexts[symbol].initialized) {
            return
        }

        this.emit('candle', symbol, timeframe, candle, isClose)
    }

    protected async initPair(pair: Pair, candle: Candle, total: number) {
        this.emit('symbol-init', pair.symbol)

        const symbol = pair.symbol
        const until = candle.openTime - 1
        const openTimes = this.timeframes.map((t) => this.timeframeHelper.getOpenTime(t, until))
        const since = Math.min(...openTimes)
        const candles = await this.getCandles(symbol, this.#lowestTimeframe, { since, until })

        for (const candle of candles) {
            this.aggregate(pair, candle, true)
        }

        this.queues[symbol].start()
        this.contexts[symbol].initialized = true
        this.emit('symbol-initialized', symbol)

        const contexts = Object.values(this.contexts)

        if (contexts.length >= total && contexts.every((c) => c.initialized)) {
            this.emit('initialized')
        }
    }

    protected async onPairUpdate({ symbol, isActive }: Pair) {
        if (!isActive) {
            await this.exchange.unwatchCandles(symbol, this.#lowestTimeframe)

            if (this.symbols?.includes(symbol)) {
                this.symbols.splice(this.symbols.indexOf(symbol), 1)
            }

            delete this.queues[symbol]
            delete this.contexts[symbol]
            delete this.#pairs[symbol]
        }
    }

    protected async onNewPair({ symbol, isActive }: Pair) {
        if (isActive) {
            await this.exchange.watchCandles(symbol, this.#lowestTimeframe)
        }
    }

    protected async createTimeframeHelper() {
        const [timezone, symbol] = await Promise.all([
            this.exchange.getTimezone(),
            this.exchange.getSymbolForSampleData(),
        ])

        const candles = await Promise.all(
            this.timeframes.map(async (t) => [t, (await this.getCandles(symbol, t, { limit: 1 }))[0]] as const)
        )

        return new TimeframeHelper(Object.fromEntries(candles), { timezone })
    }

    protected async getCandles(symbol: string, timeframe: Timeframe, options?: GetCandlesOptions) {
        const candles = await this.getCandlesFn(this.exchange, symbol, timeframe, options)
        const last = candles.at(-1)
        const { since, until, limit } = options ?? {}

        if (last && !limit && since && until && last.closeTime < until) {
            candles.push(...await this.getCandles(symbol, timeframe, { since: last.closeTime + 1, until }))
        }

        return candles
    }
}
