export interface Candle {
    openTime: number
    closeTime: number
    open: number
    high: number
    low: number
    close: number
    volume: number
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
