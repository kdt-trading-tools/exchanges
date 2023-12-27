import type { SymbolExchangeInfo, SymbolPriceFilter, SymbolLotSizeFilter, KlineInterval } from 'binance'
import { MainClient } from 'binance'
import { rtrim } from '@khangdt22/utils/string'
import { bignumber } from 'mathjs'
import { BinanceExchange } from '../exchange'
import { Market, defaultIntervals, weights } from '../constants'
import type { BinanceExchangeOptions } from '../types'
import type { Precision } from '../../../types'

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
