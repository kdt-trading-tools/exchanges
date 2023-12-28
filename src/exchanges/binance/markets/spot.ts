import type { SymbolExchangeInfo, SymbolPriceFilter, SymbolLotSizeFilter, KlineInterval, OrderResponseResult } from 'binance'
import { MainClient } from 'binance'
import { rtrim } from '@khangdt22/utils/string'
import { bignumber } from 'mathjs'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals, weights } from '../constants'
import type { BinanceExchangeOptions } from '../types'
import type { Precision, Order } from '../../../types'
import { toMathType, toPrice } from '../../../utils'
import { toSpotOrder, formatSpotOrderResponse, formatOrderStatus, formatSpotOrder } from '../utils'

export class BinanceSpot extends BinanceExchange {
    public readonly name: string = 'Binance Spot'

    protected readonly market: Market
    protected readonly restClient: MainClient
    protected readonly supportedIntervals: KlineInterval[] = ['1s', ...defaultIntervals]

    public constructor(options: BinanceExchangeOptions = {}) {
        super(options)

        this.market = Market.SPOT

        this.restClient = new MainClient({
            parseExceptions: true,
            api_key: options.apiKey,
            api_secret: options.apiSecret,
        })
    }

    public override async watchAccount() {
        const weight = weights[this.market].getListenKey
        const { listenKey } = await this.call(weight, async () => this.restClient.getSpotUserDataListenKey())
        const timer = setInterval(() => this.keepAliveListenKey(listenKey), 30 * 60 * 1000)
        const unwatch = await this.websocketClient.subscribe([listenKey])

        return async () => {
            clearInterval(timer)

            await unwatch()
            await this.closeListenKey(listenKey)
        }
    }

    public async createTestOrder(order: Order) {
        await this.call(
            weights[this.market].createTestOrder,
            async () => this.restClient.testNewOrder(toSpotOrder(order))
        )
    }

    public async getOrder(symbol: string, orderId: string) {
        const weight = weights[this.market].getOrder

        const result = await this.call(weight, async () => this.restClient.getOrder({
            symbol,
            orderId: Number(orderId),
        }))

        return formatSpotOrder(result)
    }

    public async createOrder(order: Order) {
        const weight = weights[this.market].createOrder
        const result = await this.call(weight, async () => this.restClient.submitNewOrder(toSpotOrder(order)))

        return formatSpotOrderResponse(result as OrderResponseResult)
    }

    public async cancelOrder(symbol: string, orderId: string) {
        const weight = weights[this.market].cancelOrder

        const result = await this.call(weight, async () => this.restClient.cancelOrder({
            symbol,
            orderId: Number(orderId),
        }))

        return formatOrderStatus(result.status)
    }

    public async getAccountBalances() {
        const weight = weights[this.market].getAccountInfo
        const result = await this.call(weight, async () => this.restClient.getAccountInformation())

        const balances = result.balances.filter(({ free }) => toMathType(free).gt(0)).map(({ asset, free }) => <const>[
            asset,
            toPrice(free),
        ])

        return Object.fromEntries(balances)
    }

    public override async getTradingFee(symbol: string) {
        return this.getTradingFees(symbol).then((fees) => fees[symbol])
    }

    public override async getTradingFees(symbol?: string) {
        const weight = weights[this.market].getTradingFees
        const params = symbol ? { symbol } : undefined

        const result = await this.call(weight, async () => this.restClient.getTradeFee(params)).then((fees) => (
            fees.map(({ symbol, makerCommission, takerCommission }) => <const>[
                symbol,
                {
                    maker: bignumber(makerCommission).mul(100).toNumber(),
                    taker: bignumber(takerCommission).mul(100).toNumber(),
                },
            ])
        ))

        return Object.fromEntries(result)
    }

    protected async closeListenKey(listenKey: string) {
        const weight = weights[this.market].closeListenKey

        return this.call(weight, async () => this.restClient.closeSpotUserDataListenKey(listenKey))
    }

    protected async keepAliveListenKey(listenKey: string) {
        const weight = weights[this.market].keepAliveListenKey

        return this.call(weight, async () => this.restClient.keepAliveSpotUserDataListenKey(listenKey))
    }

    protected getPrecision({ filters }: SymbolExchangeInfo): Precision {
        const { minPrice } = filters.find((f): f is SymbolPriceFilter => f.filterType === 'PRICE_FILTER')!
        const { minQty } = filters.find((f): f is SymbolLotSizeFilter => f.filterType === 'LOT_SIZE')!

        return { price: this.countFractionDigits(minPrice), quantity: this.countFractionDigits(minQty) }
    }

    protected isPairActive(pair: SymbolExchangeInfo) {
        return pair.status === 'TRADING'
    }

    protected countFractionDigits(value: number | string) {
        return rtrim(value.toString(), '0').split('.')[1]?.length ?? 0
    }
}
