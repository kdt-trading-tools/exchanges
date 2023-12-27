import type { FuturesSymbolExchangeInfo } from 'binance'
import { USDMClient } from 'binance'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals, weights } from '../constants'
import type { BinanceExchangeOptions } from '../types'
import type { Precision } from '../../../types'
import { toMathType, toPrice } from '../../../utils'

export class BinanceUSDM extends BinanceExchange {
    public readonly name: string = 'Binance USDM Futures'

    protected readonly market: Market
    protected readonly restClient: USDMClient
    protected readonly supportedIntervals = defaultIntervals

    public constructor(options: BinanceExchangeOptions = {}) {
        super(options)

        this.market = Market.USDM

        this.restClient = new USDMClient({
            parseExceptions: true,
            api_key: options.apiKey,
            api_secret: options.apiSecret,
        })
    }

    public async getAccountBalances() {
        const weight = weights[this.market].getAccountInfo
        const result = await this.call(weight, async () => this.restClient.getAccountInformation())

        const balances = result.assets.filter(({ walletBalance }) => toMathType(walletBalance).gt(0)).map(
            ({ asset, walletBalance }) => <const>[asset, toPrice(walletBalance)]
        )

        return Object.fromEntries(balances)
    }

    public override async watchPairs() {
        return this.websocketClient.subscribe(['!contractInfo'])
    }

    protected getPrecision({ pricePrecision, quantityPrecision }: FuturesSymbolExchangeInfo): Precision {
        return { price: pricePrecision, quantity: quantityPrecision }
    }

    protected isPairActive(pair: FuturesSymbolExchangeInfo) {
        return pair.status === 'TRADING'
    }
}
