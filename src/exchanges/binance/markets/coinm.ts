import { CoinMClient } from 'binance'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals, weights } from '../constants'
import type { BinanceExchangeOptions, BinanceCoinMSymbol } from '../types'
import type { Precision, OrderResponse, OrderUpdate } from '../../../types'
import { toMathType, toPrice } from '../../../utils'
import type { OrderStatus } from '../../../constants'

export class BinanceCoinM extends BinanceExchange {
    public readonly name: string = 'Binance CoinM Futures'

    protected readonly market: Market
    protected readonly restClient: CoinMClient
    protected readonly supportedIntervals = defaultIntervals

    public constructor(options: BinanceExchangeOptions = {}) {
        super(options)

        this.market = Market.COINM

        this.restClient = new CoinMClient({
            parseExceptions: true,
            api_key: options.apiKey,
            api_secret: options.apiSecret,
        })
    }

    public async createTestOrder() {
        throw new Error('Not supported')
    }

    public async createOrder(): Promise<OrderResponse> {
        throw new Error('Not supported')
    }

    public async getOrder(): Promise<OrderUpdate> {
        throw new Error('Not supported')
    }

    public async cancelOrder(): Promise<OrderStatus> {
        throw new Error('Not supported')
    }

    public async getAccountBalances() {
        const weight = weights[this.market].getAccountInfo
        const result = await this.call(weight, async () => this.restClient.getAccountInformation())

        const balances = result.assets.filter(({ walletBalance }) => toMathType(walletBalance).gt(0)).map(
            ({ asset, walletBalance }) => <const>[asset, toPrice(walletBalance)]
        )

        return Object.fromEntries(balances)
    }

    protected getPrecision({ pricePrecision, quantityPrecision }: BinanceCoinMSymbol): Precision {
        return { price: pricePrecision, quantity: quantityPrecision }
    }

    protected isPairActive(pair: BinanceCoinMSymbol) {
        return pair.contractStatus === 'TRADING'
    }
}
