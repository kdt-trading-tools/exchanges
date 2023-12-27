import { isObject } from '@khangdt22/utils/object'
import { createDeferred, poll } from '@khangdt22/utils/promise'
import { isKlineRaw, type KlineInterval, type SymbolOrderBookTicker } from 'binance'
import { wrap } from '@khangdt22/utils/array'
import { isNullish } from '@khangdt22/utils/condition'
import { Exchange, type GetCandlesOptions } from '../exchange'
import type { Pair, Precision, PriceType, TradingFee } from '../../types'
import { type Timeframe, toPrice, toTimeframeStr } from '../../utils'
import type { Market } from './constants'
import { weights, getCandlesLimits } from './constants'
import type { BinanceRestClient, BinanceExchangeInfo, BinanceSymbol, BinanceExchangeOptions, ContractInfoStream } from './types'
import { formatCandle, BinanceWebsocketClient, formatWsCandle, formatWsOrderUpdate } from './utils'
import { isContractInfoStreamEvent, isOrderBookTickerStreamEvent, isOrderUpdateStreamEvent, isBalanceUpdateStreamEvent, isAccountUpdateStreamEvent } from './utils/messages'

export abstract class BinanceExchange extends Exchange {
    protected abstract readonly market: Market
    protected abstract readonly restClient: BinanceRestClient
    protected abstract readonly supportedIntervals: KlineInterval[]

    protected exchangeInfo?: BinanceExchangeInfo
    protected exchangeInfoPromise?: Promise<BinanceExchangeInfo>
    protected pairs: Record<string, Pair> = {}
    protected pairsPromise?: Promise<Pair[]>

    #websocketClient?: BinanceWebsocketClient

    protected constructor(protected override readonly options: BinanceExchangeOptions = {}) {
        super(options)
    }

    protected get websocketClient() {
        return this.#websocketClient ??= this.createWebsocketClient()
    }

    public async getTimezone() {
        return this.getExchangeInfo().then(({ timezone }) => timezone)
    }

    public async getPair(symbol: string) {
        if (!this.pairs[symbol]) {
            await this.getPairs()
        }

        return this.pairs[symbol]
    }

    public async getPairs() {
        if (this.pairsPromise) {
            return this.pairsPromise
        }

        const promise = this.pairsPromise = createDeferred<Pair[]>()
        const { symbols } = await this.getExchangeInfo()

        promise.resolve(
            symbols.map((symbol: BinanceSymbol): Pair => (this.pairs[symbol.symbol] = this.formatPair(symbol)))
        )

        return promise
    }

    public async getCandles(symbol: string, timeframe: Timeframe, options: GetCandlesOptions = {}) {
        const { limit = getCandlesLimits[this.market], since: startTime, until: endTime } = options
        const weight = this.getGetCandlesWeight(limit)
        const interval = this.formatTimeframe(timeframe)

        const candles = await this.call(
            weight,
            async () => this.restClient.getKlines({ symbol, interval, limit, startTime, endTime })
        )

        return candles.map((candle) => formatCandle(candle))
    }

    public async getBidAsk(symbols?: string | string[]) {
        if (!Array.isArray(symbols) && !isNullish(symbols)) {
            return { [symbols]: await this.getBidAskSingleSymbol(symbols) }
        }

        return this.getBidAskMultipleSymbols(symbols)
    }

    public async getTradingFee(symbol: string): Promise<TradingFee> {
        throw new Error(`Not supported (symbol: ${symbol})`)
    }

    public async getTradingFees(): Promise<Record<string, TradingFee>> {
        throw new Error('Not supported')
    }

    public async watchAccount(): Promise<() => Promise<void>> {
        throw new Error('Not supported')
    }

    public async watchCandles(symbol: string, timeframe: Timeframe) {
        return this.watchCandlesBatch([[symbol, timeframe]])
    }

    public async watchCandlesBatch(params: Array<readonly [string, Timeframe]>) {
        return this.websocketClient.subscribe(params.map(([symbol, timeframe]) => `${symbol.toLowerCase()}@kline_${this.formatTimeframe(timeframe)}`))
    }

    public async unwatchCandles(symbol: string, timeframe: Timeframe) {
        return this.websocketClient.unsubscribe([`${symbol.toLowerCase()}@kline_${this.formatTimeframe(timeframe)}`])
    }

    public async watchPairs() {
        const check = async () => {
            const pairs = await this.getPairs().then(
                (pairs) => Object.fromEntries(pairs.map((p) => [p.symbol, p] as const))
            )

            this.exchangeInfoPromise = undefined
            this.pairsPromise = undefined
            this.pairs = {}

            const weight = weights[this.market].exchangeInfo
            const exInfo = this.exchangeInfo = await this.call(weight, async () => this.restClient.getExchangeInfo())
            const newPairs = exInfo.symbols.map((symbol: BinanceSymbol) => this.formatPair(symbol))

            for (const pair of newPairs) {
                const current = pairs[pair.symbol]

                if (!current) {
                    this.emit('pair-added', pair)
                } else if (JSON.stringify(current) !== JSON.stringify(pair)) {
                    this.emit('pair-update', pair)
                }
            }
        }

        const unwatch = poll(check, 0, true)

        return async () => {
            unwatch()
        }
    }

    public async watchBidAsk(symbol: string) {
        return this.watchBidAskBatch([symbol])
    }

    public async watchBidAskBatch(symbols: string[]) {
        return this.websocketClient.subscribe(symbols.map((s) => `${s.toLowerCase()}@bookTicker`))
    }

    public async unwatchBidAsk(symbol: string) {
        return this.websocketClient.unsubscribe([`${symbol.toLowerCase()}@bookTicker`])
    }

    protected async getBidAskMultipleSymbols(symbols?: string[]) {
        const weight = weights[this.market].getBidAskMultiple

        const prices = await this.call(weight, async () => this.restClient.getSymbolOrderBookTicker().then((r) => (
            wrap(r).map((prices) => [prices.symbol, this.formatBidAskResult(prices)] as const)
        )))

        return Object.fromEntries(prices.filter(([symbol]) => isNullish(symbols) || symbols.includes(symbol)))
    }

    protected async getBidAskSingleSymbol(symbol: string) {
        const weight = weights[this.market].getBidAsk

        return this.call(weight, async () => this.restClient.getSymbolOrderBookTicker({ symbol }).then((r) => (
            this.formatBidAskResult(Array.isArray(r) ? r[0] : r)
        )))
    }

    protected formatBidAskResult(result: SymbolOrderBookTicker) {
        return [toPrice(result.bidPrice), toPrice(result.askPrice)] as [bid: PriceType, ask: PriceType]
    }

    protected onWebsocketMessage(data: any) {
        if (isKlineRaw(data)) {
            this.emit('candle', data.s, data.k.i, formatWsCandle(data), data.k.x)
        } else if (isContractInfoStreamEvent(data)) {
            this.handlePairUpdate(data)
        } else if (isOrderBookTickerStreamEvent(data)) {
            this.emit('bid-ask', data.s, toPrice(data.b), toPrice(data.a))
        } else if (isOrderUpdateStreamEvent(data)) {
            this.emit('order', formatWsOrderUpdate(data))
        } else if (isBalanceUpdateStreamEvent(data)) {
            this.emit('balance-change', data.a, toPrice(data.d))
        } else if (isAccountUpdateStreamEvent(data)) {
            for (const { a, f } of data.B) {
                this.emit('balance', a, toPrice(f))
            }
        }
    }

    protected async handlePairUpdate({ s: symbol }: ContractInfoStream) {
        const pair = await this.getPair(symbol)

        // Reset cache.
        this.exchangeInfo = undefined
        this.exchangeInfoPromise = undefined
        this.pairs = {}
        this.pairsPromise = undefined

        const newPair = await this.getPair(symbol)

        if (pair) {
            if (newPair) {
                this.emit('pair-update', newPair)
            } else {
                this.emit('pair-removed', { ...pair, isActive: false })
            }
        } else {
            this.emit('pair-added', newPair)
        }
    }

    protected formatPair(pair: BinanceSymbol): Pair {
        const { symbol, baseAsset, quoteAsset } = pair
        const isActive = this.isPairActive(pair)
        const precision = this.getPrecision(pair)

        return { symbol, base: baseAsset, quote: quoteAsset, isActive, precision }
    }

    protected abstract isPairActive(pair: BinanceSymbol): boolean

    protected abstract getPrecision(pair: BinanceSymbol): Precision

    protected formatTimeframe(timeframe: Timeframe) {
        const timeframeStr = toTimeframeStr(timeframe) as KlineInterval

        if (!this.supportedIntervals.includes(timeframeStr)) {
            throw new Error(`Unsupported timeframe: ${timeframeStr}`)
        }

        return timeframeStr
    }

    protected getGetCandlesWeight(limit: number) {
        if (limit <= 100) {
            return weights[this.market].getCandles1
        }

        if (limit <= 500) {
            return weights[this.market].getCandles100
        }

        if (limit <= 1000) {
            return weights[this.market].getCandles500
        }

        return weights[this.market].getCandles1000
    }

    protected async getWeightPerSecond() {
        const rateLimits = await this.getExchangeInfo().then(({ rateLimits }) => rateLimits)
        const { limit, interval, intervalNum } = rateLimits.find(({ rateLimitType: i }) => i === 'REQUEST_WEIGHT')!

        const getWeightPerSecond = {
            SECOND: (limit: number) => limit,
            MINUTE: (limit: number) => limit / 60,
            DAY: (limit: number) => limit / 24 / 60,
        }

        return Math.floor(getWeightPerSecond[interval](limit / intervalNum))
    }

    protected isRateLimitError(error: any) {
        return isObject(error) && Number.parseInt(error.code) == -1003 && !!error.headers?.['retry-after']
    }

    protected getWaitTimeFromRateLimitError(error: any) {
        return Number.parseInt(error.headers['retry-after']) * 1000
    }

    protected async getExchangeInfo() {
        if (!this.exchangeInfo) {
            let weight = 0

            if (!this.exchangeInfoPromise) {
                weight = weights[this.market].exchangeInfo
                this.exchangeInfoPromise = this.restClient.getExchangeInfo()
            }

            this.exchangeInfo = await this.exchangeInfoPromise
            this.call(weight, async () => void 0)
        }

        return this.exchangeInfo
    }

    protected createWebsocketClient() {
        const client = new BinanceWebsocketClient(this.market, this.options.websocketClient)

        client.on('connect', (id, { client }) => this.logger.debug(`Connecting to websocket server ${client.address} using id ${id}`))
        client.on('connected', (id) => this.logger.debug(`Connected to websocket server ${id}`))
        client.on('reconnect', (id) => this.logger.debug(`Reconnecting to websocket server ${id}`))
        client.on('reconnected', (id) => this.logger.debug(`Reconnected to websocket server ${id}`))
        client.on('disconnect', (id) => this.logger.debug(`Disconnecting from websocket server ${id}`))
        client.on('disconnected', (id) => this.logger.debug(`Disconnected from websocket server ${id}`))
        client.on('close', (id, _, code, reason) => this.logger.warn(`Connection to websocket server ${id} closed: (${code ?? 'NONE'}) ${reason?.length ? reason : 'Unknown reason'}`))
        client.on('subscribe', (streams, id) => this.logger.trace(`Subscribing to ${streams.length} streams on websocket server ${id}`, streams))
        client.on('subscribed', (streams, id) => this.logger.trace(`Subscribed to ${streams.length} streams on websocket server ${id}`))
        client.on('stream-data', (_, data) => this.onWebsocketMessage(data))

        return client
    }
}
