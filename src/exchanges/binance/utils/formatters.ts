import type { Kline, WsMessageKlineRaw } from 'binance'
import type { Candle } from '../../../types'
import { toPrice, toQuantity } from '../../../utils'

export const formatCandle = (candle: Kline): Candle => ({
    openTime: candle[0],
    closeTime: candle[6],
    open: toPrice(candle[1]),
    high: toPrice(candle[2]),
    low: toPrice(candle[3]),
    close: toPrice(candle[4]),
    volume: toQuantity(candle[5]),
})

export const formatWsCandle = ({ k }: WsMessageKlineRaw): Candle => ({
    openTime: k.t,
    closeTime: k.T,
    open: toPrice(k.o),
    high: toPrice(k.h),
    low: toPrice(k.l),
    close: toPrice(k.c),
    volume: toQuantity(k.v),
})
