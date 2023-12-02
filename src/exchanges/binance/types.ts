import type { MainClient, USDMClient, CoinMClient, ExchangeInfo, FuturesExchangeInfo, SymbolExchangeInfo, FuturesSymbolExchangeInfo, ContractStatus } from 'binance'
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
}

export interface ContractInfoStream {
    e: 'contractInfo'
    s: string
    cs: string
}
