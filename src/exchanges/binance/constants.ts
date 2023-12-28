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
        getBidAsk: 2,
        getBidAskMultiple: 4,
        getTradingFees: 1,
        getAccountInfo: 20,
        createTestOrder: 1,
        createOrder: 1,
        getOrder: 4,
        cancelOrder: 1,
        getListenKey: 2,
        keepAliveListenKey: 2,
        closeListenKey: 2,
    },
    [Market.USDM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandles100: 2,
        getCandles500: 5,
        getCandles1000: 10,
        getBidAsk: 2,
        getBidAskMultiple: 5,
        getAccountInfo: 5,
    },
    [Market.COINM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandles100: 2,
        getCandles500: 5,
        getCandles1000: 10,
        getBidAsk: 2,
        getBidAskMultiple: 5,
        getAccountInfo: 5,
    },
}

export const testnetApiUrls: Record<Market, string | undefined> = {
    [Market.SPOT]: 'https://testnet.binance.vision',
    [Market.USDM]: undefined,
    [Market.COINM]: undefined,
}

export const testnetWsUrls: Record<Market, string | undefined> = {
    [Market.SPOT]: 'wss://testnet.binance.vision/stream',
    [Market.USDM]: undefined,
    [Market.COINM]: undefined,
}
