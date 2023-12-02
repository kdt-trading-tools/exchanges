import { WebsocketClient } from '@khangdt22/utils/websocket-client'
import { uniqueId } from '@khangdt22/utils/number'
import { filterByValue } from '@khangdt22/utils/object'
import { notUndefined } from '@khangdt22/utils/condition'
import { createDeferred, withTimeout } from '@khangdt22/utils/promise'
import { TypedEventEmitter } from '@khangdt22/utils/event'
import { unique, chunk } from '@khangdt22/utils/array'
import type { Market } from '../../constants'
import { endpoints, maxStreamsPerConnection } from './constants'
import type { ClientContext, Method, MethodParams, MethodReturnType, BinanceWebsocketClientOptions, BinanceWebsocketClientEvents } from './types'
import { RequestError, ClientError } from './errors'
import { isErrorResponse } from './utils'

export class BinanceWebsocketClient extends TypedEventEmitter<BinanceWebsocketClientEvents> {
    public readonly endpoint: string

    protected readonly requestTimeout: number
    protected readonly maxSubscribePerTime: number
    protected readonly clients: Record<string, ClientContext> = {}

    public constructor(public readonly market: Market, protected readonly options: BinanceWebsocketClientOptions = {}) {
        super()

        this.endpoint = endpoints[market]
        this.requestTimeout = options.requestTimeout ?? 10_000
        this.maxSubscribePerTime = options.maxSubscribePerTime ?? 200
    }

    public async subscribe(streams: string[]) {
        const allStreams = new Set<string>(Object.values(this.clients).flatMap((ctx) => [...ctx.streams]))
        const subscribeStreams = unique(streams.filter((stream) => !allStreams.has(stream)))
        const limit = maxStreamsPerConnection[this.market]

        // Reusing existing connections if it's not full.
        for (const [id, { client, streams: subscribedStreams }] of Object.entries(this.clients)) {
            if (!client.ready || subscribedStreams.size >= limit) {
                continue
            }

            const s = subscribeStreams.splice(0, limit - subscribedStreams.size)

            if (s.length === 0) {
                return () => this.unsubscribe(streams)
            }

            await this.sendSubscribe(id, s)
        }

        // Creating a new connection if all existing connections are full.
        for (const streamsChunk of chunk(subscribeStreams, limit)) {
            await this.connect().then((id) => this.sendSubscribe(id, streamsChunk))
        }

        return () => this.unsubscribe(streams)
    }

    public async unsubscribe(streams: string[]) {
        for (const [id, { streams: subscribedStreams }] of Object.entries(this.clients)) {
            const s = streams.filter((stream) => subscribedStreams.has(stream))

            if (s.length === 0) {
                continue
            }

            await this.send(id, 'UNSUBSCRIBE', s)

            // Verify subscriptions.
            const left = await this.send(id, 'LIST_SUBSCRIPTIONS', void 0)
            const diff = s.filter((stream) => left.includes(stream))

            if (diff.length > 0) {
                throw new ClientError({ id, ...this.clients[id] }, `Unable to unsubscribe streams: ${diff.join(', ')}`)
            }

            this.clients[id].streams = new Set(left)

            if (left.length === 0) {
                await this.disconnect(id)
            }
        }
    }

    public async close() {
        await Promise.all(Object.keys(this.clients).map((id) => this.disconnect(id)))
    }

    protected async connect() {
        const id = `websocket-${uniqueId()}`
        const options = { ...this.options, requestTimeout: this.requestTimeout, autoConnect: false }
        const client = new WebsocketClient(this.endpoint, options)
        const isConnected = createDeferred<void>()

        this.clients[id] = { client, streams: new Set<string>(), requests: {} }

        client.on('connect', this.emit.bind(this, 'connect', id, this.clients[id]))
        client.on('connected', () => this.onConnected(id).then(isConnected.resolve).catch(isConnected.reject))
        client.on('reconnect', this.emit.bind(this, 'reconnect', id, this.clients[id]))
        client.on('reconnected', this.onReconnected.bind(this, id))
        client.on('disconnect', this.emit.bind(this, 'disconnect', id, this.clients[id]))
        client.on('disconnected', this.onDisconnected.bind(this, id))
        client.on('close', this.emit.bind(this, 'close', id, this.clients[id]))
        client.on('message', this.onMessage.bind(this, id))

        await client.connect()
        await isConnected

        this.emit('connected', id, this.clients[id])

        return id
    }

    protected async disconnect(id: string) {
        await this.clients[id].client.disconnect()
    }

    protected async send<M extends Method>(clientId: string, method: M, params: MethodParams<M>) {
        const ctx = this.clients[clientId]
        const id = uniqueId()
        const payload = filterByValue({ id, method, params }, notUndefined)
        const errorContext = { ...ctx, id: clientId }

        if (!ctx.client.ready) {
            throw new RequestError(errorContext, payload, 'Client is not ready')
        }

        const request = this.clients[clientId].requests[id] = createDeferred<any>()

        await ctx.client.send(JSON.stringify(payload)).catch((error) => {
            request.reject(new RequestError(errorContext, payload, 'Request failed', { cause: error }))
        })

        const response = await withTimeout(request, this.requestTimeout, new RequestError(errorContext, payload, 'Request timeout')).finally(() => {
            delete this.clients[clientId].requests[id]
        })

        if (isErrorResponse(response)) {
            throw new RequestError(errorContext, payload, `Request error: (${response.error.code}) ${response.error.msg}`).setResponse(response)
        }

        if (!('result' in response)) {
            throw new RequestError(errorContext, payload, 'Invalid response').setResponse(response)
        }

        return response.result as MethodReturnType<M>
    }

    protected async sendSubscribe(clientId: string, streams: string[]) {
        if (streams.length === 0) {
            return []
        }

        this.emit('subscribe', streams, clientId, this.clients[clientId])

        for (const streamsChunk of chunk(streams, this.maxSubscribePerTime)) {
            await this.send(clientId, 'SUBSCRIBE', streamsChunk)
        }

        // Verify subscriptions.
        const subscribedStreams = await this.send(clientId, 'LIST_SUBSCRIPTIONS', void 0)
        const diff = streams.filter((stream) => !subscribedStreams.includes(stream))

        if (diff.length > 0) {
            throw new ClientError({ id: clientId, ...this.clients[clientId] }, `Unable to subscribe streams: ${diff.join(', ')}`)
        }

        this.emit('subscribed', streams, clientId, this.clients[clientId])

        return [...(this.clients[clientId].streams = new Set(subscribedStreams))]
    }

    protected async onMessage(id: string, message: string) {
        const data = JSON.parse(message)

        if ('id' in data && data.id in this.clients[id].requests) {
            return this.clients[id].requests[data.id].resolve(data)
        }

        this.emit('message', message, id, this.clients[id])

        if ('stream' in data) {
            this.emit('stream-data', data.stream, data.data, id, this.clients[id])
        }
    }

    protected async onConnected(id: string) {
        await this.send(id, 'LIST_SUBSCRIPTIONS', void 0).then((streams) => {
            return streams.map((stream) => this.clients[id].streams.add(stream))
        })
    }

    protected async onReconnected(id: string) {
        await this.sendSubscribe(id, [...this.clients[id].streams]).then(
            () => this.emit('reconnected', id, this.clients[id])
        )
    }

    protected async onDisconnected(id: string) {
        delete this.clients[id]
        this.emit('disconnected', id)
    }
}
