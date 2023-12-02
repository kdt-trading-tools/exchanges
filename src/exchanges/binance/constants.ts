export enum Market {
    SPOT = 'spot',
    USDM = 'usdm',
    COINM = 'coinm',
}

export const getCandlesLimits: Record<Market, number> = {
    [Market.SPOT]: 1000,
    [Market.USDM]: 1500,
    [Market.COINM]: 1500,
}

export const weights: Record<Market, Record<string, number>> = {
    [Market.SPOT]: {
        exchangeInfo: 20,
        getCandles1: 2,
        getCandle100: 2,
        getCandle500: 2,
        getCandle1000: 2,
    },
    [Market.USDM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandle100: 2,
        getCandle500: 5,
        getCandle1000: 10,
    },
    [Market.COINM]: {
        exchangeInfo: 1,
        getCandles1: 1,
        getCandle100: 2,
        getCandle500: 5,
        getCandle1000: 10,
    },
}
