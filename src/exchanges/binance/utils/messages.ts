import { isObject, isKeyOf } from '@khangdt22/utils/object'
import type { ContractInfoStream, OrderBookTickerStream, OrderUpdateStream } from '../types'

export function isAccountUpdateStreamEvent(data: any): boolean {
    return isObject(data) && 'e' in data && data.e === 'outboundAccountPosition'
}

export function isBalanceUpdateStreamEvent(data: any): boolean {
    return isObject(data) && 'e' in data && data.e === 'balanceUpdate'
}

export function isOrderUpdateStreamEvent(data: any): data is OrderUpdateStream {
    return isObject(data) && 'e' in data && data.e === 'executionReport'
}

export function isContractInfoStreamEvent(data: any): data is ContractInfoStream {
    return isObject(data) && 'e' in data && data.e === 'contractInfo'
}

export function isOrderBookTickerStreamEvent(data: any): data is OrderBookTickerStream {
    if (!isObject(data)) {
        return false
    }

    if (isKeyOf(data, 'e') && data.e === 'bookTicker') {
        return true
    }

    return isKeyOf(data, 's') && isKeyOf(data, 'b') && isKeyOf(data, 'B') && isKeyOf(data, 'a') && isKeyOf(data, 'A')
}
