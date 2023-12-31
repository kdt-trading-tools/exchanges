import { TypedEventEmitter } from '@khangdt22/utils/event'
import { Limiter, type LimiterEvents, consoleLogger, type Timeframe, type TimeframeStr } from '../utils'
import type { Logger, Pair, Candle, PriceType, TradingFee, Order, OrderResponse, OrderUpdate } from '../types'
import type { OrderStatus } from '../constants'

export type ExchangeEvents = {
    'candle': (symbol: string, timeframe: TimeframeStr, candle: Candle, isClose: boolean) => void
    'pair-added': (pair: Pair) => void
    'pair-update': (pair: Pair) => void
    'pair-removed': (pair: Pair) => void
    'rate-limit-exceeded': LimiterEvents['rate-limit-exceeded']
    'bid-ask': (symbol: string, bid: PriceType, ask: PriceType) => void
    'order': (order: OrderUpdate) => void
    'balance': (asset: string, balance: PriceType) => void
    'balance-change': (asset: string, change: PriceType) => void
}

export interface ExchangeOptions {
    logger?: Logger
}

export interface GetCandlesOptions {
    limit?: number
    since?: number
    until?: number
}

export abstract class Exchange extends TypedEventEmitter<ExchangeEvents> {
    public abstract readonly name: string

    protected readonly logger: Logger

    protected limiter?: Promise<Limiter>

    protected constructor(protected readonly options: ExchangeOptions = {}) {
        super()

        this.logger = options.logger ?? consoleLogger
    }

    public abstract createTestOrder(order: Order): Promise<void>

    public abstract createOrder(order: Order): Promise<OrderResponse>

    public abstract getOrder(symbol: string, orderId: string): Promise<OrderUpdate>

    public abstract cancelOrder(symbol: string, orderId: string): Promise<OrderStatus>

    public abstract getTimezone(): Promise<string>

    public abstract getPair(symbol: string): Promise<Pair | undefined>

    public abstract getPairs(): Promise<Pair[]>

    public abstract getCandles(symbol: string, timeframe: Timeframe, options?: GetCandlesOptions): Promise<Candle[]>

    public abstract getBidAsk(symbols?: string | string[]): Promise<Record<string, [bid: PriceType, ask: PriceType]>>

    public abstract getTradingFee(symbol: string): Promise<TradingFee>

    public abstract getTradingFees(): Promise<Record<string, TradingFee>>

    public abstract getAccountBalances(): Promise<Record<string, PriceType>>

    public abstract watchCandles(symbol: string, timeframe: Timeframe): Promise<() => Promise<void>>

    public abstract watchCandlesBatch(params: Array<readonly [string, Timeframe]>): Promise<() => Promise<void>>

    public abstract unwatchCandles(symbol: string, timeframe: Timeframe): Promise<void>

    public abstract watchPairs(): Promise<() => Promise<void>>

    public abstract watchBidAsk(symbol: string): Promise<() => Promise<void>>

    public abstract watchBidAskBatch(symbols: string[]): Promise<() => Promise<void>>

    public abstract unwatchBidAsk(symbol: string): Promise<void>

    public abstract watchAccount(): Promise<() => Promise<void>>

    public async getActivePairs() {
        return this.getPairs().then((pairs) => pairs.filter((p) => p.isActive))
    }

    protected abstract getWeightPerSecond(): Promise<number>

    protected abstract isRateLimitError(error: any): boolean

    protected abstract getWaitTimeFromRateLimitError(error: any): number

    protected async call<T>(weight: number, fn: () => Promise<T>) {
        return this.getLimiter().then((limiter) => limiter.call(weight, fn))
    }

    protected async getLimiter() {
        return this.limiter ??= this.getWeightPerSecond().then(this.createLimiter.bind(this))
    }

    protected createLimiter(weightPerSecond: number) {
        const limiter = new Limiter({
            weightPerSecond,
            isRateLimitError: this.isRateLimitError.bind(this),
            getWaitTime: this.getWaitTimeFromRateLimitError.bind(this),
        })

        limiter.on('rate-limit-exceeded', (waitUntil, waitTime) => {
            this.logger.warn(`Blocked API calls on exchange ${this.name} until ${new Date(waitUntil).toLocaleString()}`)
            this.emit('rate-limit-exceeded', waitUntil, waitTime)
        })

        return limiter
    }
}
