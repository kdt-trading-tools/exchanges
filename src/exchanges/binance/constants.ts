import type { KlineInterval } from 'binance'
import { TimeframeEnum } from '../../constants'

export enum Market {
    SPOT = 'spot',
    USDM = 'usdm',
    COINM = 'coinm',
}

export const defaultIntervals: KlineInterval[] = Object.values(TimeframeEnum)

export const getCandlesLimits: Record<Market, number> = {
    [Market.SPOT]: 1000,
    [Market.USDM]: 1500,
    [Market.COINM]: 1500,
}

export const weights: Record<Market, Record<string, number>> = {
    [Market.SPOT]: {
        exchangeInfo: 20,
        getCandles1: 2,
        getCandles100: 2,
        getCandles500: 2,
        getCandles1000: 2,
    },
    [Market.USDM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandles100: 2,
        getCandles500: 5,
        getCandles1000: 10,
    },
    [Market.COINM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandles100: 2,
        getCandles500: 5,
        getCandles1000: 10,
    },
}
