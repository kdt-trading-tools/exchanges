import type { Kline, WsMessageKlineRaw } from 'binance'
import type { Candle } from '../../../types'

export const formatCandle = (candle: Kline): Candle => ({
    openTime: candle[0],
    closeTime: candle[6],
    open: Number(candle[1]),
    high: Number(candle[2]),
    low: Number(candle[3]),
    close: Number(candle[4]),
    volume: Number(candle[5]),
})

export const formatWsCandle = ({ k }: WsMessageKlineRaw): Candle => ({
    openTime: k.t,
    closeTime: k.T,
    open: Number(k.o),
    high: Number(k.h),
    low: Number(k.l),
    close: Number(k.c),
    volume: Number(k.v),
})
