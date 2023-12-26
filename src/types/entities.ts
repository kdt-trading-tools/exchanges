export type PriceType = string

export type QuantityType = string

export interface Candle {
    openTime: number
    closeTime: number
    open: PriceType
    high: PriceType
    low: PriceType
    close: PriceType
    volume: QuantityType
}

export interface Precision {
    price: number
    quantity: number
}

export interface Pair {
    symbol: string
    isActive: boolean
    base: string
    quote: string
    precision: Precision
}
