import type { OrderType, OrderSide, OrderStatus } from '../constants'
import type { QuantityType, PriceType } from './entities'

export interface BaseOrder {
    symbol: string
    side: OrderSide
    quantity: QuantityType
}

export interface MarketOrder extends BaseOrder {
    type: OrderType.MARKET
}

export interface LimitOrder extends BaseOrder {
    type: OrderType.LIMIT | OrderType.LIMIT_MAKER
    price: PriceType
}

export interface StopOrder extends BaseOrder {
    type: OrderType.STOP_LOSS | OrderType.TAKE_PROFIT
    stopPrice: PriceType
}

export interface StopLimitOrder extends BaseOrder {
    type: OrderType.STOP_LOSS_LIMIT | OrderType.TAKE_PROFIT_LIMIT
    price: PriceType
    stopPrice: PriceType
}

export type Order = LimitOrder | MarketOrder | StopOrder | StopLimitOrder

export interface OrderResponse {
    orderId: string
    timestamp: number
    status: OrderStatus
}
