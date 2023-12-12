import type { SymbolExchangeInfo, SymbolPriceFilter, SymbolLotSizeFilter, KlineInterval } from 'binance'
import { MainClient } from 'binance'
import { rtrim } from '@khangdt22/utils/string'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals } from '../constants'
import type { BinanceExchangeOptions } from '../types'
import type { Precision } from '../../../types'

export class BinanceSpot extends BinanceExchange {
    public readonly name: string = 'Binance Spot'

    protected readonly market: Market
    protected readonly restClient: MainClient
    protected readonly supportedIntervals: KlineInterval[] = ['1s', ...defaultIntervals]

    public constructor(options?: BinanceExchangeOptions) {
        super(options)

        this.market = Market.SPOT
        this.restClient = new MainClient({ parseExceptions: true })
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
