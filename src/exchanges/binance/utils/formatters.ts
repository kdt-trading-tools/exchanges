import type { Kline, WsMessageKlineRaw, NewSpotOrderParams, OrderResponseResult, OrderStatus as OrderStatusType, SpotOrder } from 'binance'
import { isKeyOf } from '@khangdt22/utils/object'
import type { Candle, Order, OrderResponse, OrderUpdate } from '../../../types'
import { toPrice, toQuantity } from '../../../utils'
import { OrderStatus, OrderSide, OrderType } from '../../../constants'
import type { OrderUpdateStream } from '../types'

export const formatSpotOrder = (data: SpotOrder): OrderUpdate => ({
    symbol: data.symbol,
    side: formatOrderSide(data.side),
    type: formatOrderType(data.type),
    quantity: toQuantity(data.origQty),
    price: toPrice(data.price),
    stopPrice: toPrice(data.stopPrice),
    orderId: data.orderId.toString(),
    timestamp: data.time,
    status: formatOrderStatus(data.status),
    error: 'NONE',
    fee: toPrice(0),
    filledQuantity: toQuantity(data.executedQty),
    quoteQuantity: toQuantity(data.cummulativeQuoteQty),
})

export const formatWsOrderUpdate = (data: OrderUpdateStream): OrderUpdate => ({
    symbol: data.s,
    side: formatOrderSide(data.S),
    type: formatOrderType(data.o),
    quantity: toQuantity(data.q),
    price: toPrice(data.p),
    stopPrice: toPrice(data.P),
    orderId: data.i.toString(),
    timestamp: data.T,
    status: formatOrderStatus(data.X),
    error: data.r,
    fee: toPrice(data.n),
    filledQuantity: toQuantity(data.z),
    quoteQuantity: toQuantity(data.Z),
})

export const formatSpotOrderResponse = (response: OrderResponseResult): OrderResponse => ({
    orderId: response.orderId.toString(),
    status: formatOrderStatus(response.status),
    timestamp: response.transactTime,
})

export const formatOrderType = (type: string): OrderType => {
    switch (type) {
        case 'LIMIT':
            return OrderType.LIMIT
        case 'MARKET':
            return OrderType.MARKET
        case 'STOP_LOSS':
            return OrderType.STOP_LOSS
        case 'STOP_LOSS_LIMIT':
            return OrderType.STOP_LOSS_LIMIT
        case 'TAKE_PROFIT':
            return OrderType.TAKE_PROFIT
        case 'TAKE_PROFIT_LIMIT':
            return OrderType.TAKE_PROFIT_LIMIT
        case 'LIMIT_MAKER':
            return OrderType.LIMIT_MAKER
        default:
            throw new Error(`Unknown order type: ${type}`)
    }
}

export const formatOrderSide = (side: string): OrderSide => {
    switch (side) {
        case 'BUY':
            return OrderSide.BUY
        case 'SELL':
            return OrderSide.SELL
        default:
            throw new Error(`Unknown order side: ${side}`)
    }
}

export const formatOrderStatus = (status: OrderStatusType | 'EXPIRED_IN_MATCH'): OrderStatus => {
    switch (status) {
        case 'NEW':
            return OrderStatus.NEW
        case 'PARTIALLY_FILLED':
            return OrderStatus.PARTIALLY_FILLED
        case 'FILLED':
            return OrderStatus.FILLED
        case 'CANCELED':
            return OrderStatus.CANCELED
        case 'PENDING_CANCEL':
            return OrderStatus.PENDING_CANCEL
        case 'REJECTED':
            return OrderStatus.REJECTED
        case 'EXPIRED':
        case 'EXPIRED_IN_MATCH':
            return OrderStatus.EXPIRED
        default:
            throw new Error(`Unknown order status: ${status}`)
    }
}

export function isRequireTimeInForce(type: OrderType) {
    return type === OrderType.LIMIT || type === OrderType.STOP_LOSS_LIMIT || type === OrderType.TAKE_PROFIT_LIMIT
}

export const toSpotOrder = (order: Order): NewSpotOrderParams => ({
    symbol: order.symbol,
    type: order.type,
    side: order.side,
    quantity: Number(order.quantity),
    newOrderRespType: 'RESULT',
    ...(isRequireTimeInForce(order.type) ? { timeInForce: 'GTC' } : {}),
    ...(isKeyOf(order, 'price') ? { price: order['price'] } : {}),
    ...(isKeyOf(order, 'stopPrice') ? { stopPrice: order['stopPrice'] } : {}),
})

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
