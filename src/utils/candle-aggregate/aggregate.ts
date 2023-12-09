import { createDeferred } from '@khangdt22/utils/promise'
import type { Fn } from '@khangdt22/utils/function'
import PQueue from 'p-queue'
import type { Exchange } from '../../exchanges'
import type { TimeframeHelper } from '../timeframe-helper'
import type { Pair, Candle } from '../../types'
import type { Timeframe } from '../../constants'
import { isContinuous, createCandle } from '../candles'
import { round } from '../number'
import { CandleAggregateBase, type CandleAggregateBaseOptions } from './base'

export interface KnownOpenCandles {
    candles: Record<string, Candle>
    until: number
}

export interface CandleAggregateOptions extends CandleAggregateBaseOptions {
    handlePairUpdate?: boolean
    initConcurrency?: number
    emitFrom?: Record<string, Record<string, number>>
    knownOpenCandles?: Record<string, KnownOpenCandles | undefined>
}

export type CandleAggregateEvents = {
    'init': () => void
    'initialized': () => void
    'start': () => void
    'started': () => void
    'stop': () => void
    'stopped': () => void
    'pair-init': (pair: Pair, untilCandle: Candle, order: number) => void
    'pair-initialized': (pair: Pair, order: number) => void
    'aggregated': (pair: Pair, until: number, openCandles: Record<string, Candle>) => void
    'candle': (pair: Pair, timeframe: Timeframe, candle: Candle, isClose: boolean) => void
}

export interface SymbolContext {
    initialized?: boolean
    openCandles: Record<string, Candle>
    lastCloseCandle?: Candle
}

export class CandleAggregate extends CandleAggregateBase<CandleAggregateEvents> {
    public isStarted = false
    public isStopping = false

    protected readonly handlePairUpdate: boolean
    protected readonly stopFns: Fn[] = []
    protected readonly contexts: Record<string, SymbolContext> = {}
    protected readonly queues: Record<string, PQueue> = {}
    protected readonly initQueue: PQueue
    protected readonly emitFrom: Record<string, Record<string, number | undefined> | undefined>
    protected readonly knownOpenCandles: Record<string, KnownOpenCandles | undefined>

    protected initOrder = 0

    #initializing?: ReturnType<typeof createDeferred<void>>
    #timeframeHelper?: TimeframeHelper
    #pairs?: Record<string, Pair>

    public constructor(exchange: Exchange, options: CandleAggregateOptions = {}) {
        super(exchange, options)

        this.handlePairUpdate = options.handlePairUpdate ?? true
        this.initQueue = new PQueue({ concurrency: options.initConcurrency ?? 1 })
        this.emitFrom = options.emitFrom ?? {}
        this.knownOpenCandles = options.knownOpenCandles ?? {}
    }

    public get timeframeHelper() {
        return this.getValue(this.#timeframeHelper)
    }

    public get pairs() {
        return this.getValue(this.#pairs)
    }

    public get totalPairs() {
        return Object.keys(this.pairs).length
    }

    public get totalEntries() {
        return this.totalPairs * this.timeframes.length
    }

    public async init() {
        this.#initializing = createDeferred<void>()

        this.emit('init')
        this.#timeframeHelper = await this.createTimeframeHelper()
        this.#pairs = await this.getPairs().then((pairs) => Object.fromEntries(pairs.map((i) => [i.symbol, i])))

        this.exchange.on('candle', this.onCandle.bind(this))

        if (this.handlePairUpdate) {
            this.exchange.on('pair-added', this.onNewPair.bind(this))
            this.exchange.on('pair-update', this.onPairUpdate.bind(this))
            this.exchange.on('pair-removed', this.onPairUpdate.bind(this))
        }

        this.emit('initialized')
        this.#initializing.resolve()
    }

    public async start() {
        await (this.#initializing ?? this.init())

        this.emit('start')

        const stopWatchPairs = this.handlePairUpdate ? await this.exchange.watchPairs() : async () => void 0
        const params = Object.keys(this.pairs).map((i) => [i, this.lowestTimeframe] as const)
        const stopWatchCandles = await this.exchange.watchCandlesBatch(params)

        this.isStarted = true
        this.emit('started')

        return async () => {
            this.isStopping = true
            this.emit('stop')

            await stopWatchPairs()
            await stopWatchCandles()
            await Promise.all(this.stopFns.map((i) => i()))

            this.isStarted = false
            this.isStopping = false
            this.emit('stopped')
        }
    }

    protected aggregate(pair: Pair, candle: Candle, isClose: boolean, from: number, firstCandle?: Candle) {
        const { symbol, precision } = pair
        const context = this.contexts[symbol]
        const lastCloseCandle = context.lastCloseCandle

        if (isClose && lastCloseCandle && !isContinuous(lastCloseCandle, candle)) {
            throw new Error(`Candle ${candle.openTime} for symbol ${symbol} is not continuous with last close candle ${lastCloseCandle.openTime}`)
        }

        for (const timeframe of this.timeframes) {
            if (timeframe === this.lowestTimeframe) {
                this.emitCandle(pair, timeframe, candle, isClose)

                continue
            }

            const openTime = this.timeframeHelper.getOpenTime(timeframe, candle.openTime)

            if (openTime < from) {
                continue
            }

            const knownOpenCandle = this.knownOpenCandles[symbol]?.candles[timeframe]
            const closeTime = this.timeframeHelper.getCloseTime(timeframe, openTime)
            const currentOpenCandle = this.contexts[symbol].openCandles[timeframe]

            if (knownOpenCandle && !currentOpenCandle) {
                this.contexts[symbol].openCandles[timeframe] = knownOpenCandle
            } else {
                if (openTime === candle.openTime || candle.openTime === firstCandle?.openTime) {
                    this.contexts[symbol].openCandles[timeframe] = createCandle(openTime, closeTime, candle.open)
                }
            }

            if (!this.contexts[symbol].openCandles[timeframe]) {
                throw new Error(`Missing open candle for symbol ${symbol} (timeframe: ${timeframe}), current candle open time: ${candle.openTime}, missing: ${openTime}}`)
            }

            const openCandle = { ...this.contexts[symbol].openCandles[timeframe] }
            const volume = round(openCandle.volume + candle.volume, precision.quantity)

            openCandle.high = Math.max(openCandle.high, candle.high)
            openCandle.low = Math.min(openCandle.low, candle.low)
            openCandle.close = candle.close

            if (isClose) {
                openCandle.volume = volume
            }

            this.emitCandle(pair, timeframe, { ...openCandle, volume }, isClose && closeTime === candle.closeTime)
            this.contexts[symbol].openCandles[timeframe] = openCandle
        }

        if (isClose) {
            this.contexts[symbol].lastCloseCandle = candle
            this.emit('aggregated', pair, candle.closeTime, this.contexts[symbol].openCandles)
        }
    }

    protected async initPair(pair: Pair, untilCandle: Candle) {
        const order = ++this.initOrder

        this.emit('pair-init', pair, untilCandle, order)

        const until = untilCandle.openTime - 1
        const openTimes = this.timeframes.map((t) => this.timeframeHelper.getOpenTime(t, until))
        const since = Math.max(Math.min(...openTimes), (this.knownOpenCandles[pair.symbol]?.until ?? 0) + 1)
        const candles = await this.getCandles(pair.symbol, this.lowestTimeframe, since, until, false)
        const firstCandle = candles.length > 0 && candles[0].openTime > since ? candles[0] : undefined

        for (const candle of candles) {
            this.aggregate(pair, candle, true, candles[0].openTime, firstCandle)
        }

        this.queues[pair.symbol].start()
        this.contexts[pair.symbol].initialized = true

        this.emit('pair-initialized', pair, order)
    }

    protected onCandle(symbol: string, timeframe: Timeframe, candle: Candle, isClose: boolean) {
        if (!this.isStarted || this.isStopping || timeframe !== this.lowestTimeframe) {
            return
        }

        const pair = this.pairs[symbol]

        if (!this.contexts[symbol]) {
            this.contexts[symbol] = { openCandles: {} }
            this.queues[symbol] = new PQueue({ autoStart: false, concurrency: 1 })
            this.initQueue.add(() => this.initPair(pair, candle))
        }

        if (this.contexts[symbol].initialized || isClose) {
            this.queues[symbol].add(() => this.aggregate(pair, candle, isClose, 0), { priority: -candle.openTime })
        }
    }

    protected onNewPair(pair: Pair) {
        if (!this.isStarted || this.isStopping || !pair.isActive) {
            return
        }

        this.#pairs![pair.symbol] = pair

        this.exchange.watchCandles(pair.symbol, this.lowestTimeframe).then((stop) => {
            this.stopFns.push(stop)
        })
    }

    protected onPairUpdate(pair: Pair) {
        if (!this.isStarted || this.isStopping || pair.isActive) {
            return
        }

        this.exchange.unwatchCandles(pair.symbol, this.lowestTimeframe)

        delete this.#pairs![pair.symbol]
        delete this.contexts[pair.symbol]
    }

    protected emitCandle(pair: Pair, timeframe: Timeframe, candle: Candle, isClose: boolean) {
        const symbol = pair.symbol
        const emitFrom = this.emitFrom[symbol]?.[timeframe]

        if ((emitFrom || this.contexts[symbol].initialized) && candle.openTime >= (emitFrom ?? 0)) {
            this.emit('candle', pair, timeframe, candle, isClose)
        }
    }
}
