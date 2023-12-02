import { Market } from '../../constants'

export const endpoints: Record<Market, string> = {
    [Market.SPOT]: 'wss://stream.binance.com:9443/stream',
    [Market.USDM]: 'wss://fstream.binance.com/stream',
    [Market.COINM]: 'wss://dstream.binance.com/stream',
}

export const maxStreamsPerConnection: Record<Market, number> = {
    [Market.SPOT]: 1024,
    [Market.USDM]: 200,
    [Market.COINM]: 200,
}
