export enum OrderType {
    LIMIT = 'LIMIT',
    MARKET = 'MARKET',
    STOP_LOSS = 'STOP_LOSS',
    STOP_LOSS_LIMIT = 'STOP_LOSS_LIMIT',
    TAKE_PROFIT = 'TAKE_PROFIT',
    TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
    LIMIT_MAKER = 'LIMIT_MAKER',
}

export enum OrderSide {
    BUY = 'BUY',
    SELL = 'SELL',
}

export enum OrderStatus {
    NEW = 'NEW',
    PARTIALLY_FILLED = 'PARTIALLY_FILLED',
    FILLED = 'FILLED',
    CANCELED = 'CANCELED',
    PENDING_CANCEL = 'PENDING_CANCEL',
    REJECTED = 'REJECTED',
    EXPIRED = 'EXPIRED',
}

export enum TimeframeEnum {
    MIN1 = '1m',
    MIN3 = '3m',
    MIN5 = '5m',
    MIN15 = '15m',
    MIN30 = '30m',
    HOUR1 = '1h',
    HOUR2 = '2h',
    HOUR4 = '4h',
    HOUR6 = '6h',
    HOUR8 = '8h',
    HOUR12 = '12h',
    DAY1 = '1d',
    DAY3 = '3d',
    WEEK1 = '1w',
    MONTH1 = '1M',
}
