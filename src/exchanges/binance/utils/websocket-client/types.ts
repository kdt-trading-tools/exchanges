import type { WebsocketClient, WebsocketClientOptions } from '@khangdt22/utils/websocket-client'
import type { createDeferred } from '@khangdt22/utils/promise'

export type BinanceWebsocketClientOptions = Omit<WebsocketClientOptions, 'autoConnect'> & {
    endpoint?: string
    maxSubscribePerTime?: number
}

export type BinanceWebsocketClientEvents = {
    'connect': (id: string, context: ClientContext) => void
    'connected': (id: string, context: ClientContext) => void
    'reconnect': (id: string, context: ClientContext) => void
    'reconnected': (id: string, context: ClientContext) => void
    'disconnect': (id: string, context: ClientContext) => void
    'disconnected': (id: string) => void
    'close': (id: string, context: ClientContext, code?: number, reason?: Buffer) => void
    'subscribe': (streams: string[], id: string, context: ClientContext) => void
    'subscribed': (streams: string[], id: string, context: ClientContext) => void
    'message': (message: string, id: string, context: ClientContext) => void
    'stream-data': (stream: string, data: any, id: string, context: ClientContext) => void
}

export interface ClientContext {
    client: WebsocketClient
    streams: Set<string>
    requests: Record<number, ReturnType<typeof createDeferred<any>>>
}

export type MethodMap = {
    SUBSCRIBE: { params: string[]; return: null }
    UNSUBSCRIBE: { params: string[]; return: null }
    LIST_SUBSCRIPTIONS: { params: void; return: string[] }
    SET_PROPERTY: { params: ['combined', boolean]; return: null }
    GET_PROPERTY: { params: ['combined']; return: boolean }
}

export type Method = keyof MethodMap

export type MethodParams<M extends Method> = MethodMap[M]['params']

export type MethodReturnType<M extends Method> = MethodMap[M]['return']

export interface ErrorResponse {
    id: string
    error: {
        code: number
        msg: string
    }
}
