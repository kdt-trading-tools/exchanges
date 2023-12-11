import { TypedEventEmitter } from '@khangdt22/utils/event'
import { createDeferred } from '@khangdt22/utils/promise'
import type { Fn } from '@khangdt22/utils/function'
import PQueue from 'p-queue'
import type { Exchange } from '../../exchanges'
import type { Timeframe } from '../../constants'
import type { Pair, Candle } from '../../types'
import type { TimeframeHelper } from '../timeframe-helper'
import type { CandleAggregateHelperOptions } from './helper'
import { CandleAggregateHelper } from './helper'
import { CandleAggregateStore } from './store'

export type CandleAggregateEvents = {
    'init': () => void
    'initialized': () => void
    'start': () => void
    'started': () => void
    'stop': () => void
    'stopped': () => void
    'pair-init': (pair: Pair, untilCandle: Candle) => void
    'pair-initialized': (pair: Pair) => void
    'candle': (pair: Pair, timeframe: Timeframe, candle: Candle, isClose: boolean) => void
    'aggregated': (pair: Pair, candle: Candle, aggregatedCandles: Record<string, Candle>) => void
}

export interface CandleAggregateBaseOptions extends CandleAggregateHelperOptions {
    handlePairUpdate?: boolean
    unwatchOnPairDisabled?: boolean
    autoAddNewPairs?: boolean
    initConcurrency?: number
    emitFrom?: Record<string, Record<string, number | undefined> | undefined>
    emitDelay?: number
    validateEmit?: boolean
}

export abstract class BaseCandleAggregate extends TypedEventEmitter<CandleAggregateEvents> {
    public readonly helper: CandleAggregateHelper
    public readonly store: CandleAggregateStore
    public readonly timeframes: Timeframe[]
    public readonly lowestTimeframe: Timeframe

    protected readonly handlePairUpdate: boolean
    protected readonly unwatchOnPairDisabled: boolean
    protected readonly autoAddNewPairs: boolean

    protected readonly stopFns: Fn[] = []
    protected readonly initQueue: PQueue

    protected readonly emitFrom: Record<string, Record<string, number | undefined> | undefined>
    protected readonly emitDelay: number
    protected readonly validateEmit: boolean
    protected readonly emitQueues: Record<string, PQueue> = {}
    protected readonly lastEmittedOpenTimes: Record<string, number> = {}

    protected isStarted = false
    protected isStopping = false
    protected lastReceivedOpenTimes: Record<string, number> = {}

    #pairs: Record<string, Pair> = {}
    #timeframeHelper?: TimeframeHelper
    #initializing?: ReturnType<typeof createDeferred<void>>

    protected constructor(public readonly exchange: Exchange, options: CandleAggregateBaseOptions = {}) {
        super()

        this.helper = new CandleAggregateHelper(exchange, options)
        this.store = new CandleAggregateStore()

        this.timeframes = this.helper.timeframes
        this.lowestTimeframe = this.helper.lowestTimeframe

        this.emitFrom = options.emitFrom ?? {}
        this.emitDelay = options.emitDelay ?? 0
        this.validateEmit = options.validateEmit ?? true
        this.initQueue = new PQueue({ concurrency: options.initConcurrency ?? 1 })

        this.handlePairUpdate = options.handlePairUpdate ?? true
        this.unwatchOnPairDisabled = options.unwatchOnPairDisabled ?? true
        this.autoAddNewPairs = options.autoAddNewPairs ?? true
    }

    public get isReady() {
        return this.isStarted && !this.isStopping
    }

    public get pairs() {
        return Object.values(this.helper.getPropertyValue(this.#pairs))
    }

    public get timeframeHelper() {
        return this.helper.getPropertyValue(this.#timeframeHelper)
    }

    public get totalItems() {
        return this.pairs.length * this.timeframes.length
    }

    public async init() {
        this.emit('init')

        this.#initializing = createDeferred<void>()
        this.#pairs = await this.helper.getPairs().then((pairs) => Object.fromEntries(pairs.map((i) => [i.symbol, i])))
        this.#timeframeHelper = await this.helper.createTimeframeHelper()

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
        if (this.isStarted || this.isStopping) {
            return async () => this.stop()
        }

        await (this.#initializing ?? this.init())

        const exchange = this.exchange
        const lowestTimeframe = this.lowestTimeframe

        this.emit('start')

        this.stopFns.push(this.handlePairUpdate ? await exchange.watchPairs() : async () => void 0)
        this.stopFns.push(await exchange.watchCandlesBatch(this.pairs.map((i) => [i.symbol, lowestTimeframe])))

        this.isStarted = true
        this.emit('started')

        return async () => this.stop()
    }

    public async stop() {
        if (!this.isStarted || this.isStopping) {
            return
        }

        this.isStopping = true
        this.emit('stop')

        for (const stop of this.stopFns) {
            await stop()
        }

        this.#initializing = undefined

        this.exchange.off('candle', this.onCandle.bind(this))
        this.exchange.off('pair-added', this.onNewPair.bind(this))
        this.exchange.off('pair-update', this.onPairUpdate.bind(this))
        this.exchange.off('pair-removed', this.onPairUpdate.bind(this))
        this.store.clean()

        this.isStarted = false
        this.isStopping = false
        this.emit('stopped')
    }

    protected abstract initPair(pair: Pair, untilCandle: Candle): Promise<void>

    protected abstract aggregate(pair: Pair, candle: Candle, isClose: boolean): Promise<void>

    protected emitCandle(pair: Pair, timeframe: Timeframe, candle: Candle, isClose: boolean) {
        const emitFrom = this.emitFrom[pair.symbol]?.[timeframe]
        const id = `${pair.symbol}_${timeframe}`
        const isActive = this.store.isActive(pair.symbol)

        if (isActive && emitFrom && candle.openTime < emitFrom) {
            return
        }

        if ((emitFrom && candle.openTime >= emitFrom) || isActive) {
            if (this.validateEmit) {
                if (this.lastEmittedOpenTimes[id] && this.lastEmittedOpenTimes[id] !== candle.openTime) {
                    throw new Error(`Failed to emit candle for symbol ${pair.symbol} (timeframe: ${timeframe}): candles are not continues (${candle.openTime} !== ${this.lastEmittedOpenTimes[id]}, emit from: ${emitFrom}, is synced: ${isActive})`)
                }

                this.lastEmittedOpenTimes[id] = isClose ? candle.closeTime + 1 : candle.openTime
            }

            this.emitWithDelay(id, () => this.emit('candle', pair, timeframe, candle, isClose), -candle.openTime)
        }
    }

    protected emitWithDelay(id: string, fn: Fn, priority?: number) {
        if (!this.emitDelay) {
            return fn()
        }

        this.getEmitQueue(id).add(fn, { priority })
    }

    protected getEmitQueue(id: string) {
        return this.emitQueues[id] ??= new PQueue({ concurrency: 1, interval: this.emitDelay, intervalCap: 1 })
    }

    protected onCandle(symbol: string, timeframe: Timeframe, candle: Candle, isClose: boolean) {
        if (this.isStopping || timeframe !== this.lowestTimeframe || !this.#pairs[symbol]) {
            return
        }

        if (this.lastReceivedOpenTimes[symbol] && this.lastReceivedOpenTimes[symbol] !== candle.openTime) {
            throw new Error(`Candle are not continues: ${candle.openTime} !== ${this.lastReceivedOpenTimes[symbol]}`)
        }

        const pair = this.#pairs[symbol]

        if (!this.store.has(symbol)) {
            this.store.create(symbol)
            this.initQueue.add(() => this.initPair(pair, candle))
        }

        if (isClose || this.store.isActive(symbol)) {
            this.store.addToQueue(symbol, () => this.aggregate(pair, candle, isClose), -candle.openTime)
        }

        this.lastReceivedOpenTimes[symbol] = isClose ? candle.closeTime + 1 : candle.openTime
    }

    protected onNewPair(pair: Pair) {
        if (this.isStopping || !this.autoAddNewPairs || !pair.isActive) {
            return
        }

        this.#pairs[pair.symbol] = pair

        this.exchange.watchCandles(pair.symbol, this.lowestTimeframe).then((stop) => {
            this.stopFns.push(stop)
        })
    }

    protected async onPairUpdate({ symbol, isActive }: Pair) {
        if (this.isStopping || !this.#pairs[symbol] || isActive) {
            return
        }

        if (this.unwatchOnPairDisabled) {
            await this.exchange.unwatchCandles(symbol, this.lowestTimeframe)
        }

        await Promise.resolve(this.store.remove(symbol)).then(() => (
            delete this.#pairs[symbol]
        ))
    }
}
