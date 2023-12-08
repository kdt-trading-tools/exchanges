import { isObject } from '@khangdt22/utils/object'
import { createDeferred, poll } from '@khangdt22/utils/promise'
import { isKlineRaw } from 'binance'
import { Exchange, type GetCandlesOptions } from '../exchange'
import type { Pair, Precision } from '../../types'
import type { Timeframe } from '../../constants'
import type { Market } from './constants'
import { weights, getCandlesLimits } from './constants'
import type { BinanceRestClient, BinanceExchangeInfo, BinanceSymbol, BinanceExchangeOptions, ContractInfoStream } from './types'
import { formatCandle, BinanceWebsocketClient, formatWsCandle } from './utils'
import { isContractInfoStreamEvent } from './utils/messages'

export abstract class BinanceExchange extends Exchange {
    protected abstract readonly market: Market
    protected abstract readonly restClient: BinanceRestClient

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

    public async getSymbolForSampleData() {
        return this.getPairs().then((pairs) => pairs[0].symbol)
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

    public async getCandles(symbol: string, interval: Timeframe, options: GetCandlesOptions = {}) {
        const { limit = getCandlesLimits[this.market], since: startTime, until: endTime } = options
        const weight = this.getGetCandlesWeight(limit)

        const candles = await this.call(
            weight,
            async () => this.restClient.getKlines({ symbol, interval, limit, startTime, endTime })
        )

        return candles.map((candle) => formatCandle(candle))
    }

    public async watchCandles(symbol: string, timeframe: Timeframe) {
        return this.watchCandlesBatch([[symbol, timeframe]])
    }

    public async watchCandlesBatch(params: Array<readonly [string, Timeframe]>) {
        return this.websocketClient.subscribe(params.map(([symbol, interval]) => `${symbol.toLowerCase()}@kline_${interval}`))
    }

    public async unwatchCandles(symbol: string, timeframe: Timeframe) {
        return this.websocketClient.unsubscribe([`${symbol.toLowerCase()}@kline_${timeframe}`])
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

    protected onWebsocketMessage(data: any) {
        if (isKlineRaw(data)) {
            this.emit('candle', data.s, data.k.i as Timeframe, formatWsCandle(data), data.k.x)
        } else if (isContractInfoStreamEvent(data)) {
            this.handlePairUpdate(data)
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
        client.on('close', (id, _, code, reason) => this.logger.debug(`Connection to websocket server ${id} closed: (${code ?? 'NONE'}) ${reason?.length ? reason : 'Unknown reason'}`))
        client.on('subscribe', (streams, id) => this.logger.debug(`Subscribing to ${streams.length} streams on websocket server ${id}`, streams))
        client.on('subscribed', (streams, id) => this.logger.debug(`Subscribed to ${streams.length} streams on websocket server ${id}`))
        client.on('stream-data', (_, data) => this.onWebsocketMessage(data))

        return client
    }
}
