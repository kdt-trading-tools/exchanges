import type { MainClient, USDMClient, CoinMClient, ExchangeInfo, FuturesExchangeInfo, SymbolExchangeInfo, FuturesSymbolExchangeInfo, ContractStatus, OrderSide, OrderType, OrderStatus } from 'binance'
import type { ExchangeOptions } from '../exchange'
import type { BinanceWebsocketClientOptions } from './utils'

export type BinanceRestClient = MainClient | USDMClient | CoinMClient

export type BinanceExchangeInfo = ExchangeInfo | FuturesExchangeInfo

export type BinanceCoinMSymbol = Omit<FuturesSymbolExchangeInfo, 'status'> & {
    contractStatus: ContractStatus
}

export type BinanceSymbol = SymbolExchangeInfo | FuturesSymbolExchangeInfo | BinanceCoinMSymbol

export type BinanceExchangeOptions = ExchangeOptions & {
    websocketClient?: BinanceWebsocketClientOptions
    apiKey?: string
    apiSecret?: string
}

export interface ContractInfoStream {
    e: 'contractInfo'
    s: string
    cs: string
}

export interface OrderBookTickerStream {
    s: string
    b: string
    B: string
    a: string
    A: string
}

export interface OrderUpdateStream {
    e: 'executionReport'
    s: string
    S: OrderSide
    o: OrderType
    q: string
    p: string
    P: string
    X: OrderStatus
    r: string
    i: number
    T: number
    n: string
    z: string
    Z: string
}
