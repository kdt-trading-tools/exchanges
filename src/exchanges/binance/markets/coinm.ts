import { CoinMClient } from 'binance'
import { BinanceExchange } from '../exchange'
import { Market } from '../constants'
import type { BinanceExchangeOptions, BinanceCoinMSymbol } from '../types'
import type { Precision } from '../../../types'

export class BinanceCoinM extends BinanceExchange {
    public readonly name: string = 'Binance CoinM Futures'

    protected readonly market: Market
    protected readonly restClient: CoinMClient

    public constructor(options?: BinanceExchangeOptions) {
        super(options)

        this.market = Market.COINM
        this.restClient = new CoinMClient({ parseExceptions: true })
    }

    protected getPrecision({ pricePrecision, quantityPrecision }: BinanceCoinMSymbol): Precision {
        return { price: pricePrecision, quantity: quantityPrecision }
    }

    protected isPairActive(pair: BinanceCoinMSymbol) {
        return pair.contractStatus === 'TRADING'
    }
}