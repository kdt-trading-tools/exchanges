import type { FuturesSymbolExchangeInfo } from 'binance'
import { USDMClient } from 'binance'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals } from '../constants'
import type { BinanceExchangeOptions } from '../types'
import type { Precision } from '../../../types'

export class BinanceUSDM extends BinanceExchange {
    public readonly name: string = 'Binance USDM Futures'

    protected readonly market: Market
    protected readonly restClient: USDMClient
    protected readonly supportedIntervals = defaultIntervals

    public constructor(options?: BinanceExchangeOptions) {
        super(options)

        this.market = Market.USDM
        this.restClient = new USDMClient({ parseExceptions: true })
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
